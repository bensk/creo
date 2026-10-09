import { and, eq } from "drizzle-orm";
import { recordAudit } from "../../audit/record";
import type { Db } from "../../db/types";
import { isStudentOrgUnit, type Directory } from "../../google/directory";
import { users } from "../../identity/schema";
import { staff } from "../schema";
import type { GoogleSurface } from "./flow";

export type ResolveRefusal =
  | "no_account" // no SIS login for this Google account on this surface
  | "account_mismatch" // the email belongs to a different Google account than before
  | "not_student_account" // a student login whose Google account is not in the /students OU
  | "directory_unavailable"; // student sign-in needs the Directory, which isn't configured or failed

/**
 * Maps a verified Google account to an existing SIS user. Never creates
 * accounts: staff come from Directory sync, students from enrollment imports.
 * Students must also be in the /students OU, checked live in the Directory.
 */
export async function resolveGoogleUser(
  db: Db,
  account: { email: string; sub: string },
  surface: GoogleSurface,
  directory: Directory | null,
): Promise<{ ok: true; userId: string } | { ok: false; reason: ResolveRefusal }> {
  const [user] = await db
    .select({ id: users.id, schoolId: users.schoolId })
    .from(users)
    .where(and(eq(users.email, account.email), eq(users.kind, surface)));
  if (!user) return { ok: false, reason: "no_account" };

  if (surface === "staff") {
    const [person] = await db.select({ id: staff.id, googleUserId: staff.googleUserId }).from(staff).where(eq(staff.userId, user.id));
    if (!person) return { ok: false, reason: "no_account" };
    if (person.googleUserId && person.googleUserId !== account.sub) return { ok: false, reason: "account_mismatch" };
    if (!person.googleUserId) {
      // First Google sign-in before Directory sync recorded the account: pin it.
      await db.update(staff).set({ googleUserId: account.sub }).where(eq(staff.id, person.id));
      await recordAudit(db, {
        schoolId: user.schoolId, actorUserId: user.id, action: "staff.link_google_account", entity: "staff",
        entityId: person.id, after: { googleUserId: account.sub }, via: "app",
      });
    }
    return { ok: true, userId: user.id };
  }

  if (!directory) return { ok: false, reason: "directory_unavailable" };
  let directoryUser;
  try {
    directoryUser = await directory.getUser(account.email);
  } catch {
    return { ok: false, reason: "directory_unavailable" };
  }
  if (!directoryUser || directoryUser.suspended || directoryUser.id !== account.sub || !isStudentOrgUnit(directoryUser.orgUnitPath)) {
    return { ok: false, reason: "not_student_account" };
  }
  return { ok: true, userId: user.id };
}
