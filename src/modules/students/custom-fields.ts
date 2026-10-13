import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { authorize, Forbidden, visibleLevels } from "@/core/permissions";
import { SENSITIVITY_LEVELS } from "@/core/permissions/sensitivity";
import { listCustomFields, type CustomFieldDef, type CustomFieldType } from "./custom-field-defs";
import { CUSTOM_FIELD_TYPES, customFieldDefinitions, students } from "./schema";

export { listCustomFields, type CustomFieldDef, type CustomFieldType } from "./custom-field-defs";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// Custom fields: staff add a field to students without a migration. Definitions
// live in custom_field_definitions; values live in students.custom, keyed by
// the field's key. A value is always written alone (jsonb_set), never by
// rewriting the whole object, and with the student's version check.

/** "Permission slip (DC trip)" → "permission_slip_dc_trip" */
export function keyFromLabel(label: string): string {
  const key = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (/^[a-z]/.test(key) ? key : `field_${key}`).slice(0, 63);
}

/**
 * Turns what someone typed (or a typed value) into the stored value for a
 * field, or explains why it isn't valid. Null clears the value.
 */
export function coerceCustomValue(def: Pick<CustomFieldDef, "type" | "options" | "label">, raw: unknown): Result<unknown> {
  const bad = (what: string): Result<unknown> => ({ ok: false, error: `${def.label} needs ${what}.` });
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { ok: true, data: null };
  const text = typeof raw === "string" ? raw.trim() : raw;
  switch (def.type) {
    case "text":
      return typeof text === "string" && text.length <= 500 ? { ok: true, data: text } : bad("text up to 500 characters");
    case "long_text":
      return typeof text === "string" && text.length <= 5000 ? { ok: true, data: text } : bad("text up to 5,000 characters");
    case "number": {
      const n = typeof text === "number" ? text : Number(String(text).replace(/,/g, ""));
      return Number.isFinite(n) ? { ok: true, data: n } : bad("a number");
    }
    case "date":
      return typeof text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? { ok: true, data: text } : bad("a date (YYYY-MM-DD)");
    case "boolean": {
      if (typeof text === "boolean") return { ok: true, data: text };
      const t = String(text).toLowerCase();
      if (["yes", "y", "true", "1", "sí", "si"].includes(t)) return { ok: true, data: true };
      if (["no", "n", "false", "0"].includes(t)) return { ok: true, data: false };
      return bad("yes or no");
    }
    case "select": {
      const match = def.options.find((o) => o.toLowerCase() === String(text).toLowerCase());
      return match ? { ok: true, data: match } : bad(`one of: ${def.options.join(", ")}`);
    }
    case "multi_select": {
      const parts = (Array.isArray(text) ? text : String(text).split(",")).map((p) => String(p).trim()).filter(Boolean);
      const matched = parts.map((p) => def.options.find((o) => o.toLowerCase() === p.toLowerCase()));
      if (matched.some((m) => !m)) return bad(`values from: ${def.options.join(", ")}`);
      return { ok: true, data: [...new Set(matched as string[])] };
    }
  }
}

const optionList = z.array(z.string().trim().min(1).max(80)).max(50);

export const fieldInput = z.object({
  label: z.string().trim().min(1).max(80),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: optionList.default([]),
  required: z.boolean().default(false),
  sensitivity: z.enum(SENSITIVITY_LEVELS).default("standard"),
  helpText: z.string().trim().max(300).nullable().default(null),
});

export const fieldUpdate = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(80),
  options: optionList,
  required: z.boolean(),
  sensitivity: z.enum(SENSITIVITY_LEVELS),
  helpText: z.string().trim().max(300).nullable(),
  archived: z.boolean(),
});

const needsOptions = (type: CustomFieldType) => type === "select" || type === "multi_select";

/** Adds a field. The key comes from the label and never changes; the type never changes either. */
export async function createCustomField(db: Db, viewer: StaffViewer, input: z.input<typeof fieldInput>): Promise<Result<{ id: string; key: string }>> {
  const parsed = fieldInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That field isn't valid." };
  if (needsOptions(parsed.data.type) && parsed.data.options.length === 0) return { ok: false, error: "Add at least one option." };
  try {
    return await runStaffAction(db, viewer, { permission: "students.manage_fields", input: fieldInput }, async ({ tx, input: f, audit }) => {
      const key = keyFromLabel(f.label);
      const [existing] = await tx.select({ id: customFieldDefinitions.id }).from(customFieldDefinitions)
        .where(and(eq(customFieldDefinitions.schoolId, viewer.schoolId), eq(customFieldDefinitions.entity, "students"), eq(customFieldDefinitions.key, key)));
      if (existing) throw new Refused("A field with that name already exists.");
      const [{ next }] = (await tx.select({ next: sql<number>`coalesce(max(${customFieldDefinitions.position}), 0) + 1` }).from(customFieldDefinitions)
        .where(eq(customFieldDefinitions.schoolId, viewer.schoolId))) as [{ next: number }];
      const [row] = await tx.insert(customFieldDefinitions).values({
        schoolId: viewer.schoolId, createdBy: viewer.userId, entity: "students", key, label: f.label, type: f.type,
        options: needsOptions(f.type) ? f.options : [], required: f.required, sensitivity: f.sensitivity, helpText: f.helpText, position: next,
      }).returning({ id: customFieldDefinitions.id });
      await audit({ action: "custom_field.create", entity: "custom_field_definitions", entityId: row!.id, after: { key, ...f } });
      return { ok: true as const, data: { id: row!.id, key } };
    }, parsed.data);
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "Only admins and leaders can manage custom fields." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

/** Changes a field's label, options, help, required, sensitivity, or archives it. */
export async function updateCustomField(db: Db, viewer: StaffViewer, input: z.input<typeof fieldUpdate>): Promise<Result<null>> {
  const parsed = fieldUpdate.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That change isn't valid." };
  try {
    return await runStaffAction(db, viewer, { permission: "students.manage_fields", input: fieldUpdate }, async ({ tx, input: f, audit }) => {
      const [before] = await tx.select().from(customFieldDefinitions)
        .where(and(eq(customFieldDefinitions.id, f.id), eq(customFieldDefinitions.schoolId, viewer.schoolId)));
      if (!before) throw new Refused("That field wasn't found.");
      if (needsOptions(before.type as CustomFieldType) && f.options.length === 0) throw new Refused("Keep at least one option.");
      const values = {
        label: f.label, options: needsOptions(before.type as CustomFieldType) ? f.options : [], required: f.required,
        sensitivity: f.sensitivity, helpText: f.helpText, archivedAt: f.archived ? (before.archivedAt ?? new Date()) : null,
      };
      await tx.update(customFieldDefinitions).set(values).where(eq(customFieldDefinitions.id, f.id));
      await audit({
        action: "custom_field.update", entity: "custom_field_definitions", entityId: f.id,
        before: { label: before.label, options: before.options, required: before.required, sensitivity: before.sensitivity, archived: before.archivedAt !== null },
        after: { label: f.label, options: values.options, required: f.required, sensitivity: f.sensitivity, archived: f.archived },
      });
      return { ok: true as const, data: null };
    }, parsed.data);
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "Only admins and leaders can manage custom fields." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

export const customValueInput = z.object({
  studentId: z.uuid(),
  version: z.number().int().min(1),
  key: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
  value: z.unknown(),
});

/**
 * Sets one custom field on one student. Needs the same permission as editing a
 * student's details (teachers: their homeroom), and the field's sensitivity
 * must be visible to the editor for this student. Audit entries leave out
 * values above standard sensitivity.
 */
export async function setCustomValue(db: Db, viewer: StaffViewer, input: z.input<typeof customValueInput>): Promise<Result<{ version: number; value: unknown }>> {
  const parsed = customValueInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That change isn't valid." };
  const defs = await listCustomFields(db, viewer.schoolId);
  const def = defs.find((d) => d.key === parsed.data.key);
  if (!def) return { ok: false, error: "That field doesn't exist or is archived." };
  const value = coerceCustomValue(def, parsed.data.value);
  if (!value.ok) return value;
  if (def.required && value.data === null) return { ok: false, error: `${def.label} can't be empty.` };

  try {
    return await runStaffAction(
      db, viewer,
      { permission: "students.edit_identity", input: customValueInput, target: (i) => ({ studentId: i.studentId }) },
      async ({ tx, input: i, audit }) => {
        if (!(await visibleLevels(tx, viewer, i.studentId)).has(def.sensitivity)) throw new Forbidden("students.edit_identity");
        const [before] = await tx.select({ value: sql<unknown>`${students.custom} -> ${def.key}`, version: students.version }).from(students)
          .where(and(eq(students.id, i.studentId), eq(students.schoolId, viewer.schoolId)));
        if (!before) throw new Refused("That student wasn't found.");
        if (before.version !== i.version) throw new Refused("Someone else changed this student. Reload to see their change.");
        const custom = value.data === null
          ? sql`${students.custom} - ${def.key}`
          : sql`jsonb_set(${students.custom}, array[${def.key}]::text[], ${JSON.stringify(value.data)}::jsonb, true)`;
        const [after] = await tx.update(students).set({ custom, version: sql`${students.version} + 1` })
          .where(and(eq(students.id, i.studentId), eq(students.version, i.version)))
          .returning({ version: students.version });
        if (!after) throw new Refused("Someone else changed this student. Reload to see their change.");
        const shown = def.sensitivity === "standard";
        await audit({
          action: "student.set_custom_field", entity: "students", entityId: i.studentId,
          before: { [`custom.${def.key}`]: shown ? before.value : "[not recorded]" },
          after: { [`custom.${def.key}`]: shown ? value.data : "[not recorded]" },
        });
        return { ok: true as const, data: { version: after.version, value: value.data } };
      },
      parsed.data,
    );
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "You can't change that for this student." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

/** For pages that need the permission check without loading anything else. */
export async function canManageFields(db: Db, viewer: StaffViewer): Promise<boolean> {
  try {
    await authorize(db, viewer, "students.manage_fields");
    return true;
  } catch {
    return false;
  }
}
