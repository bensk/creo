import { and, eq, isNotNull } from "drizzle-orm";
import { directoryGroupMembers, roleGroupMappings, staff } from "../auth/schema";
import type { Db } from "../db/types";
import type { Directory } from "../google/directory";
import { shares } from "./schema";

/**
 * Replaces the stored members of each Google Group with what the Directory
 * says now. Only staff the SIS knows are kept. Returns how many groups were read.
 */
export async function refreshGroupMembers(db: Db, directory: Directory, schoolId: string, actorUserId: string, groupEmails: readonly string[]) {
  const groups = [...new Set(groupEmails.map((g) => g.toLowerCase()))];
  if (groups.length === 0) return 0;
  const staffByEmail = new Map(
    (await db.select({ id: staff.id, email: staff.email }).from(staff).where(eq(staff.schoolId, schoolId))).map((s) => [s.email.toLowerCase(), s.id]),
  );
  for (const group of groups) {
    const members = [...new Set((await directory.listGroupMemberEmails(group)).map((e) => staffByEmail.get(e.toLowerCase())).filter((x): x is string => Boolean(x)))];
    await db.delete(directoryGroupMembers).where(and(eq(directoryGroupMembers.schoolId, schoolId), eq(directoryGroupMembers.googleGroupEmail, group)));
    if (members.length) {
      await db.insert(directoryGroupMembers).values(members.map((staffId) => ({ schoolId, createdBy: actorUserId, googleGroupEmail: group, staffId })));
    }
  }
  return groups.length;
}

/** Groups the SIS needs members for: those mapped to roles and those something is shared with. */
export async function groupsToSync(db: Db, schoolId: string): Promise<string[]> {
  const mapped = await db.selectDistinct({ g: roleGroupMappings.googleGroupEmail }).from(roleGroupMappings).where(eq(roleGroupMappings.schoolId, schoolId));
  const shared = await db.selectDistinct({ g: shares.googleGroupEmail }).from(shares).where(and(eq(shares.schoolId, schoolId), isNotNull(shares.googleGroupEmail)));
  return [...new Set([...mapped, ...shared].map((r) => r.g!.toLowerCase()))];
}

/** The Google Groups a staff member is in (as of the last sync). */
export async function groupsOfStaff(db: Db, staffId: string): Promise<string[]> {
  const rows = await db.select({ g: directoryGroupMembers.googleGroupEmail }).from(directoryGroupMembers).where(eq(directoryGroupMembers.staffId, staffId));
  return rows.map((r) => r.g.toLowerCase());
}

export async function staffInGroup(db: Db, schoolId: string, groupEmail: string): Promise<string[]> {
  const rows = await db.select({ id: directoryGroupMembers.staffId }).from(directoryGroupMembers)
    .where(and(eq(directoryGroupMembers.schoolId, schoolId), eq(directoryGroupMembers.googleGroupEmail, groupEmail.toLowerCase())));
  return rows.map((r) => r.id);
}

