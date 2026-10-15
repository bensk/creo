import { and, desc, eq, gte, isNull, lte, or, type AnyColumn } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { dayBefore } from "@/core/imports/context";
import { can, Forbidden } from "@/core/permissions";
import type { Sensitivity } from "@/core/permissions/sensitivity";
import { fieldContext, QueryError, runQuery, specSensitivity } from "@/core/query/run";
import { querySpecSchema } from "@/core/query/spec";
import { schoolYears } from "@/core/school/schema";
import { accessibleSql, accessTo, type Access, type ShareableItem } from "@/core/sharing/access";
import { currentlyEnrolled } from "../students/queries";
import { listMembers, lists } from "./schema";

// Lists: saved sets of students. Static lists are picked by hand (members are
// effective-dated). Dynamic lists are a saved students-source filter, run as
// the person opening the list, so nobody sees more than their role allows.
// Any staff member can make one; it's private to the owner until shared.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type ListRow = typeof lists.$inferSelect;

const MAX_STUDENTS = 2000;

async function wrap<T>(work: () => Promise<Result<T>>, forbidden = "You can't change this list."): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: forbidden };
    if (error instanceof Refused) return { ok: false, error: error.message };
    if (error instanceof QueryError) return { ok: false, error: error.message };
    throw error;
  }
}

export const asShareable = (l: ListRow): ShareableItem => ({ kind: "list", id: l.id, ownerStaffId: l.ownerStaffId, sensitivity: l.sensitivity as Sensitivity });
const oversight = (db: Db, viewer: StaffViewer) => can(db, viewer, "cohorts.view_all_lists");

/** A list and the viewer's access to it, or null if they can't open it. */
export async function getList(db: Db, viewer: StaffViewer, listId: string): Promise<{ list: ListRow; access: Access } | null> {
  const [list] = await db.select().from(lists).where(and(eq(lists.id, listId), eq(lists.schoolId, viewer.schoolId)));
  if (!list) return null;
  const access = await accessTo(db, viewer, asShareable(list), await oversight(db, viewer));
  return access ? { list, access } : null;
}

/** Lists the viewer can open, newest first, archived last. */
export async function listsForViewer(db: Db, viewer: StaffViewer) {
  const visible = await accessibleSql(db, viewer, "list", { id: lists.id, owner: lists.ownerStaffId, sensitivity: lists.sensitivity }, await oversight(db, viewer));
  return db.select().from(lists).where(and(eq(lists.schoolId, viewer.schoolId), visible))
    .orderBy(lists.archivedAt, desc(lists.updatedAt));
}

const current = (today: string, startsOn: AnyColumn, endsOn: AnyColumn) => and(lte(startsOn, today), or(isNull(endsOn), gte(endsOn, today)));

/** The students on a list right now, as the viewer sees it. Dynamic lists run their filter as the viewer. */
export async function listStudentIds(db: Db, viewer: StaffViewer, list: ListRow): Promise<string[]> {
  if (list.kind === "dynamic") {
    const spec = querySpecSchema.parse(list.spec);
    const result = await runQuery(db, viewer, { ...spec, columns: ["name"], limit: MAX_STUDENTS });
    return result.rows.map((r) => r.id);
  }
  const { today } = await fieldContext(db, viewer.schoolId);
  const rows = await db.select({ id: listMembers.studentId }).from(listMembers)
    .where(and(eq(listMembers.listId, list.id), current(today, listMembers.startsOn, listMembers.endsOn)));
  return rows.map((r) => r.id);
}

export const listInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable().default(null),
  kind: z.enum(["static", "dynamic"]),
  spec: querySpecSchema.nullable().default(null),
  studentIds: z.array(z.uuid()).max(MAX_STUDENTS).default([]),
});

/**
 * Makes a list. A dynamic list's filter must be one the owner can run; its
 * sensitivity comes from the fields the filter uses. A static list can start
 * with students (e.g. the rows of a filtered grid).
 */
export async function createList(db: Db, viewer: StaffViewer, input: z.input<typeof listInput>): Promise<Result<{ id: string }>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.create_lists", input: listInput }, async ({ tx, input: l, audit }) => {
    let spec: z.infer<typeof querySpecSchema> | null = null;
    let sensitivity: Sensitivity = "standard";
    if (l.kind === "dynamic") {
      if (!l.spec || l.spec.source !== "students") throw new Refused("A dynamic list needs a student filter.");
      if (l.spec.filters.length === 0 && !l.spec.search) throw new Refused("Add at least one filter. A list of everyone is the student grid.");
      spec = { ...l.spec, columns: undefined, limit: MAX_STUDENTS };
      await runQuery(tx, viewer, { ...spec, columns: ["name"], limit: 1 }); // refuses filters the owner can't use
      sensitivity = await specSensitivity(tx, viewer.schoolId, spec);
    }
    const { today } = await fieldContext(tx, viewer.schoolId);
    const [year] = await tx.select({ id: schoolYears.id }).from(schoolYears)
      .where(and(eq(schoolYears.schoolId, viewer.schoolId), lte(schoolYears.startsOn, today), gte(schoolYears.endsOn, today)));
    if (!year) throw new Refused("No school year covers today.");
    const [row] = await tx.insert(lists).values({
      schoolId: viewer.schoolId, createdBy: viewer.userId, schoolYearId: year.id, name: l.name, description: l.description,
      kind: l.kind, spec, ownerStaffId: viewer.staffId, sensitivity,
    }).returning({ id: lists.id });
    await audit({ action: "list.create", entity: "lists", entityId: row!.id, after: { name: l.name, kind: l.kind, sensitivity, filters: spec?.filters.map((f) => f.field) } });
    if (l.kind === "static" && l.studentIds.length) {
      const enrolled = await currentlyEnrolled(tx, viewer.schoolId, l.studentIds);
      const ids = [...new Set(l.studentIds)].filter((id) => enrolled.has(id));
      if (ids.length) {
        await tx.insert(listMembers).values(ids.map((studentId) => ({ schoolId: viewer.schoolId, createdBy: viewer.userId, listId: row!.id, studentId, startsOn: today })));
        await audit({ action: "list_members.add", entity: "lists", entityId: row!.id, after: { added: ids.length } });
      }
    }
    return { ok: true as const, data: { id: row!.id } };
  }, input), "Your role can't make lists.");
}

async function editable(tx: Db, viewer: StaffViewer, listId: string) {
  const found = await getList(tx, viewer, listId);
  if (!found) throw new Refused("That list wasn't found.");
  if (found.access === "view") throw new Refused("You can view this list but not change it.");
  return found.list;
}

export const listUpdate = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable(),
  archived: z.boolean(),
});

export async function updateList(db: Db, viewer: StaffViewer, input: z.input<typeof listUpdate>): Promise<Result<null>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.create_lists", input: listUpdate }, async ({ tx, input: u, audit }) => {
    const list = await editable(tx, viewer, u.id);
    const next = { name: u.name, description: u.description, archivedAt: u.archived ? (list.archivedAt ?? new Date()) : null };
    await tx.update(lists).set(next).where(eq(lists.id, list.id));
    await audit({ action: "list.update", entity: "lists", entityId: list.id, before: { name: list.name, archived: Boolean(list.archivedAt) }, after: { name: u.name, archived: u.archived } });
    return { ok: true as const, data: null };
  }, input));
}

const membersInput = z.object({ listId: z.uuid(), studentIds: z.array(z.uuid()).min(1).max(MAX_STUDENTS) });

export async function addListMembers(db: Db, viewer: StaffViewer, input: z.input<typeof membersInput>): Promise<Result<{ added: number }>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.create_lists", input: membersInput }, async ({ tx, input: m, audit }) => {
    const list = await editable(tx, viewer, m.listId);
    if (list.kind !== "static") throw new Refused("A dynamic list follows its filter. Change the filter instead.");
    const { today } = await fieldContext(tx, viewer.schoolId);
    const enrolled = await currentlyEnrolled(tx, viewer.schoolId, m.studentIds);
    const already = new Set((await tx.select({ id: listMembers.studentId }).from(listMembers)
      .where(and(eq(listMembers.listId, list.id), current(today, listMembers.startsOn, listMembers.endsOn)))).map((r) => r.id));
    const ids = [...new Set(m.studentIds)].filter((id) => enrolled.has(id) && !already.has(id));
    if (ids.length === 0) throw new Refused("Those students are already on the list, or aren't enrolled.");
    await tx.insert(listMembers).values(ids.map((studentId) => ({ schoolId: viewer.schoolId, createdBy: viewer.userId, listId: list.id, studentId, startsOn: today })));
    await audit({ action: "list_members.add", entity: "lists", entityId: list.id, after: { studentIds: ids } });
    return { ok: true as const, data: { added: ids.length } };
  }, input));
}

export async function removeListMember(db: Db, viewer: StaffViewer, input: { listId: string; studentId: string }): Promise<Result<null>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "cohorts.create_lists", input: z.object({ listId: z.uuid(), studentId: z.uuid() }) }, async ({ tx, input: m, audit }) => {
    const list = await editable(tx, viewer, m.listId);
    const { today } = await fieldContext(tx, viewer.schoolId);
    const rows = await tx.select().from(listMembers)
      .where(and(eq(listMembers.listId, list.id), eq(listMembers.studentId, m.studentId), current(today, listMembers.startsOn, listMembers.endsOn)));
    if (rows.length === 0) throw new Refused("That student isn't on the list.");
    for (const r of rows) {
      if (r.startsOn >= today) await tx.delete(listMembers).where(eq(listMembers.id, r.id));
      else await tx.update(listMembers).set({ endsOn: dayBefore(today) }).where(eq(listMembers.id, r.id));
    }
    await audit({ action: "list_members.remove", entity: "lists", entityId: list.id, after: { studentId: m.studentId } });
    return { ok: true as const, data: null };
  }, input));
}
