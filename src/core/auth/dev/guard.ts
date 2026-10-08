import "server-only";
import { getDb } from "../../db/client";
import { isLocalDatabaseUrl } from "../../db/local-guard";
import { isDatabaseSynthetic } from "../../db/synthetic";

// Dev sign-in: pick a seeded test user and get a real session as them.
// Four independent guards, all required:
//   1. The route only exists in `next dev` builds (*.dev.tsx, see next.config.ts).
//   2. NODE_ENV is development and DEV_SIGN_IN=true (checked here, every request and action).
//   3. The database is on this machine and was seeded (creo.synthetic_data).
//   4. In production, setting DEV_SIGN_IN at all stops the server from starting (core/env).
// Never weaken these. Staging uses real Google sign-in.

/** Appears in the dev sign-in page so CI can prove it is absent from production builds. */
export const DEV_SIGN_IN_MARKER = "creo-dev-sign-in-route";

export type DevSignInStatus =
  | { allowed: true }
  | { allowed: false; reason: "disabled" | "remote_database" | "not_seeded" };

/** Whether the route should exist at all (the caller 404s when this is false). */
export function devSignInEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_SIGN_IN === "true";
}

export async function devSignInStatus(): Promise<DevSignInStatus> {
  if (!devSignInEnabled()) return { allowed: false, reason: "disabled" };
  if (!isLocalDatabaseUrl(process.env.DATABASE_URL ?? "")) return { allowed: false, reason: "remote_database" };
  if (!(await isDatabaseSynthetic(getDb()))) return { allowed: false, reason: "not_seeded" };
  return { allowed: true };
}
