import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db/client";
import { createSession, revokeSession, type SignInMethod } from "./session";
import { SURFACES, type Surface } from "./surfaces";
import { validateSession } from "./session";
import type { FamilyViewer, StaffViewer, StudentViewer, Viewer } from "./viewer";

// The Next.js side of sessions: cookies, per-request viewer lookup, and the
// guards every page and server action calls. Layouts alone are not enough,
// because a layout does not re-run on every navigation.

type ViewerFor<S extends Surface> = S extends "staff" ? StaffViewer : S extends "student" ? StudentViewer : FamilyViewer;

/** The signed-in viewer for a surface, or null. Cached for the rest of the request. */
export const getViewer = cache(async <S extends Surface>(surface: S): Promise<ViewerFor<S> | null> => {
  const token = (await cookies()).get(SURFACES[surface].cookie)?.value;
  if (!token) return null;
  return (await validateSession(getDb(), token, surface)) as ViewerFor<S> | null;
});

/** The viewer, or a redirect to the surface's sign-in page. */
export async function requireViewer<S extends Surface>(surface: S): Promise<ViewerFor<S>> {
  const viewer = await getViewer(surface);
  if (!viewer) redirect(SURFACES[surface].signIn);
  return viewer;
}

/**
 * Signs a user in on a surface and sets the cookie. Call only from a server
 * action or route handler, after the user's identity has been verified.
 */
export async function signIn(userId: string, surface: Surface, method: SignInMethod): Promise<Viewer> {
  const { token, expiresAt, viewer } = await getDb().transaction((tx) =>
    createSession(tx, { userId, surface, method }),
  );
  const config = SURFACES[surface];
  (await cookies()).set(config.cookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: config.cookiePath,
    // Staff sessions roll in the database, so the cookie outlives a single week.
    expires: surface === "staff" ? new Date(Date.now() + 400 * 86_400_000) : expiresAt,
  });
  return viewer;
}

/** Revokes the current session on a surface and clears its cookie. */
export async function signOut(surface: Surface): Promise<void> {
  const config = SURFACES[surface];
  const store = await cookies();
  const token = store.get(config.cookie)?.value;
  if (token) await getDb().transaction((tx) => revokeSession(tx, token));
  store.delete({ name: config.cookie, path: config.cookiePath });
}
