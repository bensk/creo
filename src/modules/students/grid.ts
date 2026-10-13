import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { authorize, Forbidden } from "@/core/permissions";
import { savedViews } from "@/core/query/schema";
import { QueryError, runQuery } from "@/core/query/run";
import { querySpecSchema, type QuerySpecInput } from "@/core/query/spec";
import { students } from "./schema";

// The student grid's logic, free of Next.js so it can be tested directly.
// grid-actions.ts wraps each function as a server action with the session.

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function queryStudents(db: Db, viewer: StaffViewer, spec: QuerySpecInput) {
  try {
    return { ok: true as const, data: await runQuery(db, viewer, spec) };
  } catch (error) {
    if (error instanceof QueryError) return { ok: false as const, error: error.message };
    throw error;
  }
}

// What can be edited in a cell, and the permission each needs.
const EDITABLE = {
  preferredFirstName: { column: students.preferredFirstName, permission: "students.edit_identity", value: z.string().trim().max(60).nullable() },
  pronouns: { column: students.pronouns, permission: "students.edit_identity", value: z.string().trim().max(40).nullable() },
  medicalAlert: { column: students.medicalAlert, permission: "students.edit_alerts", value: z.string().trim().max(200).nullable() },
  mediaConsent: { column: students.mediaConsent, permission: "students.edit_alerts", value: z.enum(["yes", "no", "ask_first"]).nullable() },
} as const;
export type EditableField = keyof typeof EDITABLE;
export const EDITABLE_FIELDS = Object.keys(EDITABLE) as EditableField[];

export const cellInput = z.object({
  studentId: z.uuid(),
  version: z.number().int().min(1),
  field: z.enum(EDITABLE_FIELDS as [EditableField, ...EditableField[]]),
  value: z.unknown(),
});

const CONFLICT = "Someone else changed this student. Reload to see their change.";

/**
 * Changes one field on one student. The version must match what the editor
 * read; if someone changed the student since, nothing is written. Empty text
 * is stored as null.
 */
export async function updateStudentCell(db: Db, viewer: StaffViewer, input: z.input<typeof cellInput>): Promise<ActionResult<{ version: number }>> {
  const parsed = cellInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That change isn't valid." };
  const spec = EDITABLE[parsed.data.field];
  const raw = typeof parsed.data.value === "string" && parsed.data.value.trim() === "" ? null : parsed.data.value;
  const value = spec.value.safeParse(raw);
  if (!value.success) return { ok: false, error: "That value isn't allowed here." };

  try {
    return await runStaffAction(
      db, viewer,
      { permission: spec.permission, input: cellInput, target: (i) => ({ studentId: i.studentId }), readOnly: false },
      async ({ tx, input: i, audit }): Promise<ActionResult<{ version: number }>> => {
        const [before] = await tx.select({ value: spec.column, version: students.version }).from(students)
          .where(and(eq(students.id, i.studentId), eq(students.schoolId, viewer.schoolId)));
        if (!before) throw new QueryError("That student wasn't found.");
        if (before.version !== i.version) throw new QueryError(CONFLICT);
        const [after] = await tx.update(students)
          .set({ [i.field]: value.data, version: before.version + 1 })
          .where(and(eq(students.id, i.studentId), eq(students.version, i.version)))
          .returning({ version: students.version });
        if (!after) throw new QueryError(CONFLICT);
        await audit({ action: "student.update", entity: "students", entityId: i.studentId, before: { [i.field]: before.value }, after: { [i.field]: value.data } });
        return { ok: true, data: { version: after.version } };
      },
      { ...parsed.data, value: value.data },
    );
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "You can't change that for this student." };
    if (error instanceof QueryError) return { ok: false, error: error.message };
    throw error;
  }
}

export const viewInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  spec: querySpecSchema,
  sharing: z.enum(["private", "school"]),
});

/** Views you can use: yours, plus any shared with the school. */
export async function listStudentViews(db: Db, viewer: StaffViewer) {
  await authorize(db, viewer, "students.view");
  return db
    .select({ id: savedViews.id, name: savedViews.name, spec: savedViews.spec, sharing: savedViews.sharing, ownerUserId: savedViews.ownerUserId })
    .from(savedViews)
    .where(and(eq(savedViews.schoolId, viewer.schoolId), eq(savedViews.source, "students"), or(eq(savedViews.ownerUserId, viewer.userId), eq(savedViews.sharing, "school"))))
    .orderBy(savedViews.name);
}

/** Creates a view, or updates one you own. Sharing a view never shares data someone can't already see. */
export async function saveStudentView(db: Db, viewer: StaffViewer, input: z.input<typeof viewInput>): Promise<ActionResult<{ id: string }>> {
  try {
    return await runStaffAction(db, viewer, { permission: "students.view", input: viewInput }, async ({ tx, input: v, audit }) => {
      const values = { name: v.name, spec: v.spec, columns: v.spec.columns ?? [], sharing: v.sharing };
      if (v.id) {
        const [updated] = await tx.update(savedViews).set(values)
          .where(and(eq(savedViews.id, v.id), eq(savedViews.ownerUserId, viewer.userId)))
          .returning({ id: savedViews.id });
        if (!updated) throw new QueryError("You can only change your own views.");
        await audit({ action: "saved_view.update", entity: "saved_views", entityId: updated.id, after: values });
        return { ok: true as const, data: { id: updated.id } };
      }
      const [created] = await tx.insert(savedViews)
        .values({ schoolId: viewer.schoolId, createdBy: viewer.userId, ownerUserId: viewer.userId, source: "students", ...values })
        .returning({ id: savedViews.id });
      await audit({ action: "saved_view.create", entity: "saved_views", entityId: created!.id, after: values });
      return { ok: true as const, data: { id: created!.id } };
    }, input);
  } catch (error) {
    if (error instanceof QueryError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function deleteStudentView(db: Db, viewer: StaffViewer, id: string): Promise<ActionResult<null>> {
  try {
    return await runStaffAction(db, viewer, { permission: "students.view", input: z.object({ id: z.uuid() }) }, async ({ tx, input, audit }) => {
      const [deleted] = await tx.delete(savedViews).where(and(eq(savedViews.id, input.id), eq(savedViews.ownerUserId, viewer.userId))).returning({ id: savedViews.id, name: savedViews.name });
      if (!deleted) throw new QueryError("You can only delete your own views.");
      await audit({ action: "saved_view.delete", entity: "saved_views", entityId: deleted.id, before: { name: deleted.name } });
      return { ok: true as const, data: null };
    }, { id });
  } catch (error) {
    if (error instanceof QueryError) return { ok: false, error: error.message };
    throw error;
  }
}
