import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { recordAudit } from "../audit/record";
import { roleGroupMappings, staff, staffRoles } from "../auth/schema";
import type { StaffRole } from "../db/columns";
import type { Db } from "../db/types";
import { users } from "../identity/schema";
import { isStudentOrgUnit, type Directory, type DirectoryUser } from "./directory";

// Nightly Directory sync (`pnpm directory:sync`, run as a Cloud Run job):
//  - staff accounts (everyone outside the /students OU) are created, updated, or
//    deactivated to match the Directory;
//  - roles come from Google Group membership via role_group_mappings. Rows with
//    source "directory" are added or ended; manual rows are never touched;
//  - every change is written to the audit log by the "Google Directory sync" system user.
// Students are not created here; they come from enrollment imports.

export interface SyncSummary {
  created: number;
  updated: number;
  deactivated: number;
  rolesAdded: number;
  rolesEnded: number;
}

const SYNC_USER_NAME = "Google Directory sync";

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The "Google Directory sync" system user, created on first use. */
export async function syncUserIdFor(db: Db, schoolId: string): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.schoolId, schoolId), eq(users.kind, "system"), eq(users.displayName, SYNC_USER_NAME)));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, schoolId, createdBy: id, kind: "system", displayName: SYNC_USER_NAME });
  return id;
}

/**
 * Brings staff and their Directory-sourced roles in line with Google Workspace.
 * `today` is the school-day date the changes take effect (school time zone).
 */
export async function syncStaffFromDirectory(
  db: Db,
  directory: Directory,
  options: { schoolId: string; today: string },
): Promise<SyncSummary> {
  const { schoolId, today } = options;
  const yesterday = addDays(today, -1);
  const actor = await syncUserIdFor(db, schoolId);
  const audit = (action: string, entity: string, entityId: string, before: unknown, after: unknown) =>
    recordAudit(db, { schoolId, actorUserId: actor, action, entity, entityId, before, after, via: "system" });
  const summary: SyncSummary = { created: 0, updated: 0, deactivated: 0, rolesAdded: 0, rolesEnded: 0 };

  // 1. Who should be staff, and which roles their groups give them.
  const directoryStaff = new Map<string, DirectoryUser>();
  for (const u of await directory.listUsers()) if (!isStudentOrgUnit(u.orgUnitPath)) directoryStaff.set(u.email, u);

  const mappings = await db
    .select({ group: roleGroupMappings.googleGroupEmail, role: roleGroupMappings.role })
    .from(roleGroupMappings)
    .where(eq(roleGroupMappings.schoolId, schoolId));
  const desiredRoles = new Map<string, Map<StaffRole, string>>(); // email → role → group it came from
  for (const group of [...new Set(mappings.map((m) => m.group.toLowerCase()))].sort()) {
    const members = await directory.listGroupMemberEmails(group);
    for (const { role } of mappings.filter((m) => m.group.toLowerCase() === group)) {
      for (const email of members) {
        const roles = desiredRoles.get(email) ?? new Map<StaffRole, string>();
        if (!roles.has(role as StaffRole)) roles.set(role as StaffRole, group);
        desiredRoles.set(email, roles);
      }
    }
  }

  // 2. Staff accounts.
  const existing = await db
    .select({
      id: staff.id, userId: staff.userId, email: staff.email, googleUserId: staff.googleUserId, givenName: staff.givenName,
      familyName: staff.familyName, orgUnitPath: staff.orgUnitPath, status: staff.status, synced: staff.directorySyncedAt,
    })
    .from(staff)
    .where(eq(staff.schoolId, schoolId));
  const byEmail = new Map(existing.map((s) => [s.email.toLowerCase(), s]));
  const staffIdByEmail = new Map<string, { id: string; active: boolean }>();
  const now = new Date();

  for (const u of directoryStaff.values()) {
    const status = u.suspended ? "inactive" : "active";
    const current = byEmail.get(u.email);
    if (!current) {
      if (u.suspended) continue;
      const userId = crypto.randomUUID();
      const staffId = crypto.randomUUID();
      const displayName = `${u.givenName} ${u.familyName}`.trim();
      await db.insert(users).values({ id: userId, schoolId, createdBy: actor, kind: "staff", email: u.email, displayName });
      await db.insert(staff).values({
        id: staffId, schoolId, createdBy: actor, userId, email: u.email, googleUserId: u.id, givenName: u.givenName,
        familyName: u.familyName, orgUnitPath: u.orgUnitPath, status, directorySyncedAt: now,
      });
      await audit("staff.create", "staff", staffId, null, { email: u.email, givenName: u.givenName, familyName: u.familyName });
      summary.created++;
      staffIdByEmail.set(u.email, { id: staffId, active: true });
      continue;
    }

    const next = { googleUserId: u.id, givenName: u.givenName, familyName: u.familyName, orgUnitPath: u.orgUnitPath, status };
    const before = {
      googleUserId: current.googleUserId, givenName: current.givenName, familyName: current.familyName,
      orgUnitPath: current.orgUnitPath, status: current.status,
    };
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== before[k]);
    await db.update(staff).set({ ...next, directorySyncedAt: now }).where(eq(staff.id, current.id));
    if (changed.length > 0) {
      await db.update(users)
        .set({ displayName: `${u.givenName} ${u.familyName}`.trim(), status: status === "active" ? "active" : "disabled" })
        .where(eq(users.id, current.userId));
      await audit(
        status === "inactive" && current.status === "active" ? "staff.deactivate" : "staff.update", "staff", current.id,
        Object.fromEntries(changed.map((k) => [k, before[k]])), Object.fromEntries(changed.map((k) => [k, next[k]])),
      );
      if (status === "inactive" && current.status === "active") summary.deactivated++;
      else summary.updated++;
    }
    staffIdByEmail.set(u.email, { id: current.id, active: status === "active" });
  }

  // Staff the sync created or updated before who are gone from the Directory.
  // Staff added by hand (never synced) are left alone.
  for (const s of existing) {
    if (directoryStaff.has(s.email.toLowerCase()) || !s.synced || s.status === "inactive") continue;
    await db.update(staff).set({ status: "inactive", directorySyncedAt: now }).where(eq(staff.id, s.id));
    await db.update(users).set({ status: "disabled" }).where(eq(users.id, s.userId));
    await audit("staff.deactivate", "staff", s.id, { status: s.status }, { status: "inactive", reason: "not in Directory" });
    summary.deactivated++;
    staffIdByEmail.set(s.email.toLowerCase(), { id: s.id, active: false });
  }

  // 3. Directory-sourced roles.
  const currentRows = await db
    .select({ id: staffRoles.id, staffId: staffRoles.staffId, role: staffRoles.role, startsOn: staffRoles.startsOn })
    .from(staffRoles)
    .where(
      and(
        eq(staffRoles.schoolId, schoolId), eq(staffRoles.source, "directory"), lte(staffRoles.startsOn, today),
        or(isNull(staffRoles.endsOn), gte(staffRoles.endsOn, today)),
      ),
    );
  const rowsByStaff = new Map<string, typeof currentRows>();
  for (const r of currentRows) rowsByStaff.set(r.staffId, [...(rowsByStaff.get(r.staffId) ?? []), r]);

  for (const [email, person] of staffIdByEmail) {
    const want = person.active ? (desiredRoles.get(email) ?? new Map<StaffRole, string>()) : new Map<StaffRole, string>();
    const have = rowsByStaff.get(person.id) ?? [];
    for (const row of have) {
      if (want.has(row.role as StaffRole)) continue;
      // Ends effective today. A role that only started today is removed outright (the audit log keeps it).
      if (row.startsOn >= today) await db.delete(staffRoles).where(eq(staffRoles.id, row.id));
      else await db.update(staffRoles).set({ endsOn: yesterday }).where(eq(staffRoles.id, row.id));
      await audit("staff_role.end", "staff_roles", row.id, { role: row.role }, { endsOn: yesterday, source: "directory" });
      summary.rolesEnded++;
    }
    for (const [role, group] of want) {
      if (have.some((r) => r.role === role)) continue;
      const [added] = await db
        .insert(staffRoles)
        .values({ schoolId, createdBy: actor, staffId: person.id, role, source: "directory", sourceGroupEmail: group, startsOn: today })
        .returning({ id: staffRoles.id });
      await audit("staff_role.add", "staff_roles", added!.id, null, { role, group, startsOn: today });
      summary.rolesAdded++;
    }
  }

  return summary;
}

