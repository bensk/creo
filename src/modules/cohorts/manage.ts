import { and, eq, gte, isNull, lte, or, type AnyColumn } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "@/core/actions/run";
import { staff } from "@/core/auth/schema";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { dayBefore } from "@/core/imports/context";
import { Forbidden } from "@/core/permissions";
import { fieldContext } from "@/core/query/run";
import { schoolYears } from "@/core/school/schema";
import { currentlyEnrolled } from "../students/queries";
import { IMPORT_MANAGED_GROUP_TYPES } from "./queries";
import { GROUP_STAFF_FUNCTIONS, groupMemberships, groups, groupStaff } from "./schema";

// Managing groups by hand: create, rename, archive, and change who's in them.
// Memberships stay effective-dated: adding starts today, removing ends
// yesterday (or removes a membership that only started today), so history holds.
// Homerooms and grade teams are filled by the imports (Clever, the Big Data
// Tracker); their students can't be changed here, only their staff.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const EDITABLE_GROUP_TYPES = ["advisory", "intervention", "club", "team", "custom"] as const;
const FORBIDDEN = "Only admins, leaders, and ops can change groups.";

async function wrap<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: FORBIDDEN };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

async function groupIn(tx: Db, viewer: StaffViewer, groupId: string) {
  const [g] = await tx.select().from(groups).where(and(eq(groups.id, groupId), eq(groups.schoolId, viewer.schoolId)));
  if (!g) throw new Refused("That group wasn't found.");
  return g;
}

const isCurrent = (today: string, startsOn: AnyColumn, endsOn: AnyColumn) =>
  and(lte(startsOn, today), or(isNull(endsOn), gte(endsOn, today)));

export const groupInput = z.object({
  type: z.enum(EDITABLE_GROUP_TYPES),
  name: z.string().trim().min(1).max(80),
  gradeLevel: z.number().int().min(5).max(8).nullable(),
});

export async function createGroup(db: Db, viewer: StaffViewer, input: z.input<typeof groupInput>): Promise<Result<{ id: string }>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.manage", input: groupInput }, async ({ tx, input: g, audit }) => {
    const { today } = await fieldContext(tx, viewer.schoolId);
    const [year] = await tx.select({ id: schoolYears.id }).from(schoolYears)
      .where(and(eq(schoolYears.schoolId, viewer.schoolId), lte(schoolYears.startsOn, today), gte(schoolYears.endsOn, today)));
    if (!year) throw new Refused("No school year covers today.");
    const [dup] = await tx.select({ id: groups.id }).from(groups)
      .where(and(eq(groups.schoolYearId, year.id), eq(groups.type, g.type), eq(groups.name, g.name)));
    if (dup) throw new Refused("A group with that name already exists this year.");
    const [row] = await tx.insert(groups).values({ schoolId: viewer.schoolId, createdBy: viewer.userId, schoolYearId: year.id, ...g, ownerStaffId: viewer.staffId })
      .returning({ id: groups.id });
    await audit({ action: "group.create", entity: "groups", entityId: row!.id, after: g });
    return { ok: true as const, data: { id: row!.id } };
  }, input));
}

export const groupUpdate = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80), archived: z.boolean() });

export async function updateGroup(db: Db, viewer: StaffViewer, input: z.input<typeof groupUpdate>): Promise<Result<null>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.manage", input: groupUpdate }, async ({ tx, input: u, audit }) => {
    const g = await groupIn(tx, viewer, u.id);
    if ((IMPORT_MANAGED_GROUP_TYPES as readonly string[]).includes(g.type) && (u.name !== g.name || u.archived)) {
      throw new Refused("Homerooms and grade teams come from the imports, so they can't be renamed or archived here.");
    }
    const next = { name: u.name, archivedAt: u.archived ? (g.archivedAt ?? new Date()) : null };
    await tx.update(groups).set(next).where(eq(groups.id, g.id));
    await audit({ action: "group.update", entity: "groups", entityId: g.id, before: { name: g.name, archived: Boolean(g.archivedAt) }, after: { name: u.name, archived: u.archived } });
    return { ok: true as const, data: null };
  }, input));
}

const membersInput = z.object({ groupId: z.uuid(), studentIds: z.array(z.uuid()).min(1).max(500) });

/** Adds students (currently enrolled, this school) starting today. Students already in the group are skipped. */
export async function addGroupMembers(db: Db, viewer: StaffViewer, input: z.input<typeof membersInput>): Promise<Result<{ added: number }>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.manage", input: membersInput }, async ({ tx, input: m, audit }) => {
    const g = await groupIn(tx, viewer, m.groupId);
    if ((IMPORT_MANAGED_GROUP_TYPES as readonly string[]).includes(g.type)) throw new Refused("Homeroom and grade team students come from the imports. Change them in Schoolrunner or the Big Data Tracker.");
    if (g.archivedAt) throw new Refused("That group is archived.");
    const { today } = await fieldContext(tx, viewer.schoolId);
    const enrolled = await currentlyEnrolled(tx, viewer.schoolId, m.studentIds);
    const already = new Set((await tx.select({ id: groupMemberships.studentId }).from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, g.id), isCurrent(today, groupMemberships.startsOn, groupMemberships.endsOn)))).map((r) => r.id));
    const toAdd = [...new Set(m.studentIds)].filter((id) => enrolled.has(id) && !already.has(id));
    if (toAdd.length === 0) throw new Refused("Those students are already in the group, or aren't enrolled.");
    const rows = await tx.insert(groupMemberships)
      .values(toAdd.map((studentId) => ({ schoolId: viewer.schoolId, createdBy: viewer.userId, groupId: g.id, studentId, startsOn: today })))
      .returning({ id: groupMemberships.id, studentId: groupMemberships.studentId });
    for (const r of rows) await audit({ action: "group_membership.create", entity: "group_memberships", entityId: r.id, after: { groupId: g.id, studentId: r.studentId, startsOn: today } });
    return { ok: true as const, data: { added: rows.length } };
  }, input));
}

const memberInput = z.object({ groupId: z.uuid(), studentId: z.uuid() });

/** Takes a student out of a group as of today; their earlier membership stays in history. */
export async function removeGroupMember(db: Db, viewer: StaffViewer, input: z.input<typeof memberInput>): Promise<Result<null>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.manage", input: memberInput }, async ({ tx, input: m, audit }) => {
    const g = await groupIn(tx, viewer, m.groupId);
    if ((IMPORT_MANAGED_GROUP_TYPES as readonly string[]).includes(g.type)) throw new Refused("Homeroom and grade team students come from the imports. Change them in Schoolrunner or the Big Data Tracker.");
    const { today } = await fieldContext(tx, viewer.schoolId);
    const current = await tx.select({ id: groupMemberships.id, startsOn: groupMemberships.startsOn }).from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, g.id), eq(groupMemberships.studentId, m.studentId), isCurrent(today, groupMemberships.startsOn, groupMemberships.endsOn)));
    if (current.length === 0) throw new Refused("That student isn't in the group.");
    for (const r of current) {
      if (r.startsOn >= today) await tx.delete(groupMemberships).where(eq(groupMemberships.id, r.id));
      else await tx.update(groupMemberships).set({ endsOn: dayBefore(today) }).where(eq(groupMemberships.id, r.id));
      await audit({ action: "group_membership.end", entity: "group_memberships", entityId: r.id, after: { groupId: g.id, studentId: m.studentId, endsOn: dayBefore(today) } });
    }
    return { ok: true as const, data: null };
  }, input));
}

const staffInput = z.object({ groupId: z.uuid(), staffId: z.uuid(), function: z.enum(GROUP_STAFF_FUNCTIONS) });

/** Adds a staff member to a group (any type, including homerooms: grade team leads aren't in the imports). */
export async function addGroupStaff(db: Db, viewer: StaffViewer, input: z.input<typeof staffInput>): Promise<Result<null>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.manage", input: staffInput }, async ({ tx, input: s, audit }) => {
    const g = await groupIn(tx, viewer, s.groupId);
    const [person] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, s.staffId), eq(staff.schoolId, viewer.schoolId), eq(staff.status, "active")));
    if (!person) throw new Refused("That staff member wasn't found.");
    const { today } = await fieldContext(tx, viewer.schoolId);
    const [existing] = await tx.select({ id: groupStaff.id }).from(groupStaff)
      .where(and(eq(groupStaff.groupId, g.id), eq(groupStaff.staffId, s.staffId), eq(groupStaff.function, s.function), isCurrent(today, groupStaff.startsOn, groupStaff.endsOn)));
    if (existing) throw new Refused("They're already on this group.");
    const [row] = await tx.insert(groupStaff).values({ schoolId: viewer.schoolId, createdBy: viewer.userId, groupId: g.id, staffId: s.staffId, function: s.function, startsOn: today })
      .returning({ id: groupStaff.id });
    await audit({ action: "group_staff.create", entity: "group_staff", entityId: row!.id, after: s });
    return { ok: true as const, data: null };
  }, input));
}

export async function removeGroupStaff(db: Db, viewer: StaffViewer, groupStaffId: string): Promise<Result<null>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.manage", input: z.object({ id: z.uuid() }) }, async ({ tx, input, audit }) => {
    const { today } = await fieldContext(tx, viewer.schoolId);
    const [row] = await tx.select().from(groupStaff).where(and(eq(groupStaff.id, input.id), eq(groupStaff.schoolId, viewer.schoolId)));
    if (!row || (row.endsOn && row.endsOn < today)) throw new Refused("They're not on this group.");
    if (row.startsOn >= today) await tx.delete(groupStaff).where(eq(groupStaff.id, row.id));
    else await tx.update(groupStaff).set({ endsOn: dayBefore(today) }).where(eq(groupStaff.id, row.id));
    await audit({ action: "group_staff.end", entity: "group_staff", entityId: row.id, after: { groupId: row.groupId, staffId: row.staffId, endsOn: dayBefore(today) } });
    return { ok: true as const, data: null };
  }, { id: groupStaffId }));
}
