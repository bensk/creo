import { and, eq, gt, isNull } from "drizzle-orm";
import { recordAudit, type AuditVia } from "../audit/record";
import type { Db } from "../db/types";
import { schools, users } from "../identity/schema";
import { sessions, SIGN_IN_METHODS } from "./schema";
import { sessionExpiry, STAFF_SESSION_MS } from "./expiry";
import { SURFACES, type Surface } from "./surfaces";
import { hashSessionToken, newSessionToken } from "./tokens";
import { loadViewer, type Viewer } from "./viewer";

export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

export class SignInRefused extends Error {
  constructor(readonly reason: "no_user" | "wrong_surface" | "disabled" | "no_access") {
    super(`Sign-in refused: ${reason}`);
  }
}

/** Only touch last_seen_at (and roll a staff session) this often, to keep reads cheap. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * Starts a session for an existing user and returns the token for the cookie.
 * Every sign-in path (Google, email code, dev) ends here, so permissions and
 * auditing are identical regardless of how someone signed in. The user must
 * already be able to use the surface: a staff member with no roles or a family
 * contact with no portal access is refused.
 */
export async function createSession(
  db: Db,
  input: { userId: string; surface: Surface; method: SignInMethod; now?: Date },
): Promise<{ token: string; expiresAt: Date; viewer: Viewer }> {
  const now = input.now ?? new Date();
  const [user] = await db
    .select({ id: users.id, kind: users.kind, status: users.status, schoolId: users.schoolId, timezone: schools.timezone })
    .from(users)
    .innerJoin(schools, eq(schools.id, users.schoolId))
    .where(eq(users.id, input.userId));

  if (!user) throw new SignInRefused("no_user");
  if (user.kind !== SURFACES[input.surface].userKind) throw new SignInRefused("wrong_surface");
  if (user.status !== "active") throw new SignInRefused("disabled");

  const viewer = await loadViewer(db, user.id, input.surface);
  if (!viewer || !viewer.hasAccess) throw new SignInRefused("no_access");

  const token = newSessionToken();
  const expiresAt = sessionExpiry(input.surface, now, user.timezone);
  const [created] = await db
    .insert(sessions)
    .values({
      schoolId: user.schoolId, userId: user.id, tokenHash: hashSessionToken(token),
      surface: input.surface, method: input.method, expiresAt, lastSeenAt: now,
    })
    .returning({ id: sessions.id });
  await db.update(users).set({ lastSignInAt: now }).where(eq(users.id, user.id));

  const via: AuditVia = input.method === "dev" ? "dev" : "app";
  await recordAudit(db, {
    schoolId: user.schoolId, actorUserId: user.id, action: "auth.sign_in", entity: "sessions",
    entityId: created!.id, after: { surface: input.surface, method: input.method }, via,
  });

  return { token, expiresAt, viewer };
}

/**
 * Resolves a cookie token to a viewer, or null if the session is unknown,
 * expired, revoked, on another surface, or the user lost access since.
 */
export async function validateSession(
  db: Db,
  token: string,
  surface: Surface,
  now: Date = new Date(),
): Promise<Viewer | null> {
  const [row] = await db
    .select({
      id: sessions.id, userId: sessions.userId, lastSeenAt: sessions.lastSeenAt, status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        eq(sessions.surface, surface),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    );
  if (!row || row.status !== "active") return null;

  const viewer = await loadViewer(db, row.userId, surface);
  if (!viewer || !viewer.hasAccess) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({
        lastSeenAt: now,
        // Staff sessions roll: 7 days from the last activity.
        ...(surface === "staff" ? { expiresAt: new Date(now.getTime() + STAFF_SESSION_MS) } : {}),
      })
      .where(eq(sessions.id, row.id));
  }
  return viewer;
}

/** Ends a session. Unknown or already-revoked tokens are ignored. */
export async function revokeSession(db: Db, token: string, now: Date = new Date()): Promise<void> {
  const [revoked] = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id, userId: sessions.userId, schoolId: sessions.schoolId, method: sessions.method });
  if (revoked) {
    await recordAudit(db, {
      schoolId: revoked.schoolId, actorUserId: revoked.userId, action: "auth.sign_out", entity: "sessions",
      entityId: revoked.id, via: revoked.method === "dev" ? "dev" : "app",
    });
  }
}

