import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction, type ActionContext } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { coerceValue, keyFromLabel } from "@/core/fields/values";
import { Forbidden, highestLevel } from "@/core/permissions";
import type { Sensitivity } from "@/core/permissions/sensitivity";
import { fieldContext, sourceWithFields } from "@/core/query/run";
import { schoolYears } from "@/core/school/schema";
import { notifyChange } from "@/core/realtime";
import { shareTargetProblem } from "@/core/sharing/access";
import { sharesOf } from "@/core/sharing/manage";
import { currentlyEnrolled } from "../students/queries";
import { asShareable, canEdit, getTracker } from "./access";
import { fieldSpecSchema, MAX_ROWS, populationOf, populationSchema, type FieldSpec, type Result, type TrackerRow } from "./model";
import { resolvePopulation } from "./population";
import { isStoredRule, NEEDS_VALUE, type StoredRule } from "./rules";
import { trackerFields, trackerRows, trackers, trackerTemplates } from "./schema";

// Making and changing trackers. Any staff member can make one; it's private
// until shared. Values are written one cell at a time with a version check,
// so two people editing the same tracker don't overwrite each other.

async function wrap<T>(work: () => Promise<Result<T>>, forbidden = "You can't change this tracker."): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: forbidden };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

/** Other columns a rule may refer to, by key. */
type ColumnIndex = Map<string, { label: string; sensitivity: Sensitivity; isRule: boolean }>;

/**
 * The sensitivity of a column: chosen for typed columns, the student field's
 * for computed ones, and the highest of the columns a rule checks.
 */
async function fieldSensitivity(db: Db, schoolId: string, f: FieldSpec, others: ColumnIndex): Promise<Sensitivity> {
  if (f.type === "rule") {
    const levels: Sensitivity[] = [];
    for (const c of f.all) {
      const col = others.get(c.column);
      if (!col) throw new Refused(`“${f.label}” checks a column that doesn't exist.`);
      if (col.isRule) throw new Refused(`“${f.label}” can't check another rule (“${col.label}”).`);
      if (NEEDS_VALUE.has(c.op) && (c.value === null || c.value === "")) throw new Refused(`“${f.label}”: add a value for “${col.label}”.`);
      levels.push(col.sensitivity);
    }
    return highestLevel(levels);
  }
  if (f.type !== "computed") return f.sensitivity;
  const { fields } = await sourceWithFields("students", { db, ctx: await fieldContext(db, schoolId) });
  const def = fields.find((d) => d.key === f.field && !d.hidden);
  if (!def) throw new Refused(`There's no student field called “${f.field}”.`);
  return def.sensitivity;
}

/** Refuses a change that would make the tracker more sensitive than someone it's shared with may see. */
async function checkSharesStillAllowed(tx: Db, tracker: TrackerRow, next: Sensitivity) {
  if (next === tracker.sensitivity) return;
  for (const s of await sharesOf(tx, asShareable(tracker))) {
    const target = s.userId ? { userId: s.userId } : { googleGroupEmail: s.googleGroupEmail! };
    if (await shareTargetProblem(tx, tracker.schoolId, next, target)) {
      throw new Refused(`That would make the tracker ${next}, and ${s.name ?? s.googleGroupEmail} couldn't see it. Remove their access first.`);
    }
  }
}

function fieldRow(f: FieldSpec, key: string, sensitivity: Sensitivity, position: number) {
  if (f.type === "rule") return { key, label: f.label, type: "computed", options: [], computed: { kind: "rule", all: f.all } satisfies StoredRule, sensitivity, position };
  return f.type === "computed"
    ? { key, label: f.label, type: "computed", options: [], computed: { field: f.field, since: f.since }, sensitivity, position }
    : { key, label: f.label, type: f.type, options: f.type === "select" || f.type === "multi_select" ? f.options : [], computed: null, sensitivity, position };
}

/** The columns a tracker has now, for rules to refer to. */
async function columnIndex(tx: Db, trackerId: string): Promise<ColumnIndex> {
  const rows = await tx.select().from(trackerFields).where(and(eq(trackerFields.trackerId, trackerId), isNull(trackerFields.archivedAt)));
  return new Map(rows.map((r) => [r.key, { label: r.label, sensitivity: r.sensitivity as Sensitivity, isRule: isStoredRule(r.computed) }]));
}

export const trackerInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable().default(null),
  population: populationSchema,
  fields: z.array(fieldSpecSchema).max(60).default([]),
  templateId: z.uuid().nullable().default(null),
});

/** Makes a tracker: works out its students (as the creator), its columns, and its sensitivity. */
export async function createTracker(db: Db, viewer: StaffViewer, input: z.input<typeof trackerInput>): Promise<Result<{ id: string; students: number }>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "trackers.create", input: trackerInput }, async ({ tx, input: t, audit }) => {
    const resolved = await resolvePopulation(tx, viewer, t.population);
    if (!resolved.ok) throw new Refused(resolved.error);
    if (resolved.studentIds.length > MAX_ROWS) throw new Refused(`A tracker can have up to ${MAX_ROWS} students.`);
    const labels = new Set<string>();
    const keys: string[] = [];
    for (const f of t.fields) {
      if (labels.has(f.label.toLowerCase())) throw new Refused(`Two columns are called “${f.label}”.`);
      labels.add(f.label.toLowerCase());
      if ((f.type === "select" || f.type === "multi_select") && f.options.length === 0) throw new Refused(`“${f.label}” needs at least one option.`);
      let key = keyFromLabel(f.label);
      for (let n = 2; keys.includes(key); n++) key = `${keyFromLabel(f.label)}_${n}`;
      keys.push(key);
    }
    // Typed and computed columns first, so rules can refer to them by key.
    const index: ColumnIndex = new Map();
    const fieldLevels: Sensitivity[] = new Array(t.fields.length);
    for (const [i, f] of t.fields.entries()) {
      if (f.type === "rule") continue;
      fieldLevels[i] = await fieldSensitivity(tx, viewer.schoolId, f, index);
      index.set(keys[i]!, { label: f.label, sensitivity: fieldLevels[i]!, isRule: false });
    }
    for (const [i, f] of t.fields.entries()) if (f.type === "rule") fieldLevels[i] = await fieldSensitivity(tx, viewer.schoolId, f, index);
    const sensitivity = highestLevel([resolved.sensitivity, ...fieldLevels]);
    const { today } = await fieldContext(tx, viewer.schoolId);
    const [year] = await tx.select({ id: schoolYears.id }).from(schoolYears)
      .where(and(eq(schoolYears.schoolId, viewer.schoolId), lte(schoolYears.startsOn, today), gte(schoolYears.endsOn, today)));
    if (!year) throw new Refused("No school year covers today.");
    const p = t.population;
    const [row] = await tx.insert(trackers).values({
      schoolId: viewer.schoolId, createdBy: viewer.userId, schoolYearId: year.id, name: t.name, description: t.description,
      ownerStaffId: viewer.staffId, populationKind: p.kind, populationSource: p.source,
      populationGrade: p.source === "grade" ? p.grade : null, populationRef: p.source === "group" || p.source === "list" ? p.ref : null,
      populationSpec: p.source === "spec" ? { ...p.spec, columns: undefined } : null, sensitivity, templateId: t.templateId,
    }).returning({ id: trackers.id });
    const id = row!.id;
    if (t.fields.length) {
      await tx.insert(trackerFields).values(t.fields.map((f, i) => ({ schoolId: viewer.schoolId, createdBy: viewer.userId, trackerId: id, ...fieldRow(f, keys[i]!, fieldLevels[i]!, i) })));
    }
    if (resolved.studentIds.length) {
      await tx.insert(trackerRows).values(resolved.studentIds.map((studentId) => ({ schoolId: viewer.schoolId, createdBy: viewer.userId, trackerId: id, studentId, addedOn: today })));
    }
    await audit({ action: "tracker.create", entity: "trackers", entityId: id, after: { name: t.name, population: { kind: p.kind, source: p.source }, columns: t.fields.map((f) => f.label), sensitivity, students: resolved.studentIds.length } });
    return { ok: true as const, data: { id, students: resolved.studentIds.length } };
  }, input), "Your role can't make trackers.");
}

async function editable(ctx: ActionContext<unknown>, trackerId: string): Promise<TrackerRow> {
  const found = await getTracker(ctx.tx, ctx.viewer, trackerId);
  if (!found) throw new Refused("That tracker wasn't found.");
  if (!canEdit(found.access)) throw new Refused("You can view this tracker but not change it.");
  if (found.tracker.archivedAt) throw new Refused("This tracker is archived.");
  return found.tracker;
}

/** Recomputes a tracker's sensitivity after its columns change. */
async function refreshSensitivity(tx: Db, viewer: StaffViewer, tracker: TrackerRow, extra: Sensitivity[] = []): Promise<Sensitivity> {
  const fields = await tx.select({ sensitivity: trackerFields.sensitivity, archivedAt: trackerFields.archivedAt }).from(trackerFields).where(eq(trackerFields.trackerId, tracker.id));
  const pop = await resolvePopulation(tx, viewer, populationOf(tracker));
  const next = highestLevel([pop.ok ? pop.sensitivity : (tracker.sensitivity as Sensitivity), ...fields.filter((f) => !f.archivedAt).map((f) => f.sensitivity as Sensitivity), ...extra]);
  await checkSharesStillAllowed(tx, tracker, next);
  if (next !== tracker.sensitivity) await tx.update(trackers).set({ sensitivity: next }).where(eq(trackers.id, tracker.id));
  return next;
}

const addFieldInput = z.object({ trackerId: z.uuid(), field: fieldSpecSchema });

export async function addTrackerField(db: Db, viewer: StaffViewer, input: z.input<typeof addFieldInput>): Promise<Result<{ key: string }>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "trackers.create", input: addFieldInput }, async (ctx) => {
    const { tx, input: a, audit } = ctx;
    const tracker = await editable(ctx, a.trackerId);
    const existing = await tx.select({ key: trackerFields.key, label: trackerFields.label, position: trackerFields.position }).from(trackerFields).where(eq(trackerFields.trackerId, tracker.id));
    if (existing.some((e) => e.label.toLowerCase() === a.field.label.toLowerCase())) throw new Refused(`There's already a column called “${a.field.label}”.`);
    if ((a.field.type === "select" || a.field.type === "multi_select") && a.field.options.length === 0) throw new Refused("Add at least one option.");
    const sensitivity = await fieldSensitivity(tx, viewer.schoolId, a.field, await columnIndex(tx, tracker.id));
    await refreshSensitivity(tx, viewer, tracker, [sensitivity]);
    let key = keyFromLabel(a.field.label);
    const keys = new Set(existing.map((e) => e.key));
    for (let n = 2; keys.has(key); n++) key = `${keyFromLabel(a.field.label)}_${n}`;
    const position = Math.max(-1, ...existing.map((e) => e.position)) + 1;
    await tx.insert(trackerFields).values({ schoolId: viewer.schoolId, createdBy: viewer.userId, trackerId: tracker.id, ...fieldRow(a.field, key, sensitivity, position) });
    await notifyChange(tx, { kind: "tracker", id: tracker.id, rowIds: [], by: viewer.userId });
    await audit({ action: "tracker.field_add", entity: "trackers", entityId: tracker.id, after: { key, label: a.field.label, type: a.field.type, sensitivity } });
    return { ok: true as const, data: { key } };
  }, input));
}

export async function archiveTrackerField(db: Db, viewer: StaffViewer, input: { trackerId: string; key: string }): Promise<Result<null>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "trackers.create", input: z.object({ trackerId: z.uuid(), key: z.string().min(1).max(80) }) }, async (ctx) => {
    const tracker = await editable(ctx, ctx.input.trackerId);
    const active = await ctx.tx.select({ label: trackerFields.label, computed: trackerFields.computed }).from(trackerFields)
      .where(and(eq(trackerFields.trackerId, tracker.id), isNull(trackerFields.archivedAt)));
    const usedBy = active.filter((r) => isStoredRule(r.computed) && r.computed.all.some((c) => c.column === ctx.input.key)).map((r) => r.label);
    if (usedBy.length) throw new Refused(`“${usedBy.join("”, “")}” checks this column. Remove that rule first.`);
    const [f] = await ctx.tx.update(trackerFields).set({ archivedAt: new Date() })
      .where(and(eq(trackerFields.trackerId, tracker.id), eq(trackerFields.key, ctx.input.key))).returning({ id: trackerFields.id });
    if (!f) throw new Refused("That column wasn't found.");
    await refreshSensitivity(ctx.tx, viewer, tracker);
    await notifyChange(ctx.tx, { kind: "tracker", id: tracker.id, rowIds: [], by: viewer.userId });
    await ctx.audit({ action: "tracker.field_archive", entity: "trackers", entityId: tracker.id, after: { key: ctx.input.key } });
    return { ok: true as const, data: null };
  }, input));
}

const cellInput = z.object({
  trackerId: z.uuid(), rowId: z.uuid(), key: z.string().min(1).max(80), value: z.unknown(),
  /** What the editor saw in the cell before changing it (null if empty). */
  expected: z.unknown(),
});

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Sets one cell, if it still holds what the editor saw (compare-and-set per
 * cell): two people editing different cells of one row don't collide; editing
 * the same cell at once does, and the second is told. Only typed columns can
 * be edited; computed ones follow their student field.
 */
export async function setTrackerCell(db: Db, viewer: StaffViewer, input: z.input<typeof cellInput>): Promise<Result<{ version: number; value: unknown }>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "trackers.create", input: cellInput }, async (ctx) => {
    const { tx, input: c, audit } = ctx;
    const tracker = await editable(ctx, c.trackerId);
    const [field] = await tx.select().from(trackerFields).where(and(eq(trackerFields.trackerId, tracker.id), eq(trackerFields.key, c.key)));
    if (!field || field.archivedAt) throw new Refused("That column doesn't exist.");
    if (field.type === "computed") throw new Refused(`“${field.label}” is computed from student data and can't be typed over.`);
    const value = coerceValue({ type: field.type as Parameters<typeof coerceValue>[0]["type"], options: field.options, label: field.label }, c.value);
    if (!value.ok) throw new Refused(value.error);
    const [row] = await tx.select({ id: trackerRows.id, version: trackerRows.version, before: sql<unknown>`${trackerRows.data} -> ${c.key}` })
      .from(trackerRows).where(and(eq(trackerRows.id, c.rowId), eq(trackerRows.trackerId, tracker.id)));
    if (!row) throw new Refused("That row wasn't found.");
    if (!same(row.before, c.expected)) throw new Refused(`Someone else just changed “${field.label}” for this student. Reload to see their change.`);
    const data = value.data === null
      ? sql`${trackerRows.data} - ${c.key}`
      : sql`jsonb_set(${trackerRows.data}, array[${c.key}]::text[], ${JSON.stringify(value.data)}::jsonb, true)`;
    // The row is re-checked in the update itself, so two saves racing on one cell can't both pass.
    const [after] = await tx.update(trackerRows).set({ data, version: sql`${trackerRows.version} + 1` })
      .where(and(eq(trackerRows.id, row.id), sql`coalesce(${trackerRows.data} -> ${c.key}, 'null'::jsonb) = ${JSON.stringify(c.expected ?? null)}::jsonb`))
      .returning({ version: trackerRows.version });
    if (!after) throw new Refused(`Someone else just changed “${field.label}” for this student. Reload to see their change.`);
    await notifyChange(tx, { kind: "tracker", id: tracker.id, rowIds: [row.id], by: viewer.userId });
    const shown = field.sensitivity === "standard";
    await audit({
      action: "tracker.cell_set", entity: "tracker_rows", entityId: row.id,
      before: { [c.key]: shown ? row.before : "[not recorded]" }, after: { [c.key]: shown ? value.data : "[not recorded]" },
    });
    return { ok: true as const, data: { version: after.version, value: value.data } };
  }, input));
}

const rowsInput = z.object({ trackerId: z.uuid(), studentIds: z.array(z.uuid()).min(1).max(MAX_ROWS) });

/** Adds students to a snapshot tracker (live trackers follow their population). */
export async function addTrackerRows(db: Db, viewer: StaffViewer, input: z.input<typeof rowsInput>): Promise<Result<{ added: number }>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "trackers.create", input: rowsInput }, async (ctx) => {
    const tracker = await editable(ctx, ctx.input.trackerId);
    if (tracker.populationKind === "live") throw new Refused("This tracker follows its population. Change who's in the group or list instead.");
    const { today } = await fieldContext(ctx.tx, viewer.schoolId);
    const enrolled = await currentlyEnrolled(ctx.tx, viewer.schoolId, ctx.input.studentIds);
    const existing = await ctx.tx.select({ id: trackerRows.id, studentId: trackerRows.studentId, archivedOn: trackerRows.archivedOn }).from(trackerRows)
      .where(and(eq(trackerRows.trackerId, tracker.id), inArray(trackerRows.studentId, ctx.input.studentIds)));
    const restore = existing.filter((e) => e.archivedOn).map((e) => e.id);
    const fresh = [...new Set(ctx.input.studentIds)].filter((id) => enrolled.has(id) && !existing.some((e) => e.studentId === id));
    if (!restore.length && !fresh.length) throw new Refused("Those students are already on the tracker, or aren't enrolled.");
    if (restore.length) await ctx.tx.update(trackerRows).set({ archivedOn: null }).where(inArray(trackerRows.id, restore));
    if (fresh.length) await ctx.tx.insert(trackerRows).values(fresh.map((studentId) => ({ schoolId: viewer.schoolId, createdBy: viewer.userId, trackerId: tracker.id, studentId, addedOn: today })));
    await notifyChange(ctx.tx, { kind: "tracker", id: tracker.id, rowIds: [], by: viewer.userId });
    await ctx.audit({ action: "tracker.rows_add", entity: "trackers", entityId: tracker.id, after: { studentIds: [...fresh, ...existing.filter((e) => restore.includes(e.id)).map((e) => e.studentId)] } });
    return { ok: true as const, data: { added: restore.length + fresh.length } };
  }, input));
}

/** Takes a student off a snapshot tracker. Their values are kept (archived), not deleted. */
export async function removeTrackerRow(db: Db, viewer: StaffViewer, input: { trackerId: string; rowId: string }): Promise<Result<null>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "trackers.create", input: z.object({ trackerId: z.uuid(), rowId: z.uuid() }) }, async (ctx) => {
    const tracker = await editable(ctx, ctx.input.trackerId);
    if (tracker.populationKind === "live") throw new Refused("This tracker follows its population. Change who's in the group or list instead.");
    const { today } = await fieldContext(ctx.tx, viewer.schoolId);
    const [row] = await ctx.tx.update(trackerRows).set({ archivedOn: today })
      .where(and(eq(trackerRows.id, ctx.input.rowId), eq(trackerRows.trackerId, tracker.id))).returning({ studentId: trackerRows.studentId });
    if (!row) throw new Refused("That row wasn't found.");
    await notifyChange(ctx.tx, { kind: "tracker", id: tracker.id, rowIds: [], by: viewer.userId });
    await ctx.audit({ action: "tracker.row_remove", entity: "trackers", entityId: tracker.id, after: { studentId: row.studentId } });
    return { ok: true as const, data: null };
  }, input));
}

export const trackerUpdate = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80), description: z.string().trim().max(300).nullable(), archived: z.boolean() });

export async function updateTracker(db: Db, viewer: StaffViewer, input: z.input<typeof trackerUpdate>): Promise<Result<null>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "trackers.create", input: trackerUpdate }, async ({ tx, input: u, audit }) => {
    const found = await getTracker(tx, viewer, u.id);
    if (!found) throw new Refused("That tracker wasn't found.");
    if (!canEdit(found.access)) throw new Refused("You can view this tracker but not change it.");
    const t = found.tracker;
    await tx.update(trackers).set({ name: u.name, description: u.description, archivedAt: u.archived ? (t.archivedAt ?? new Date()) : null }).where(eq(trackers.id, t.id));
    await notifyChange(tx, { kind: "tracker", id: t.id, rowIds: [], by: viewer.userId });
    await audit({ action: "tracker.update", entity: "trackers", entityId: t.id, before: { name: t.name, archived: Boolean(t.archivedAt) }, after: { name: u.name, archived: u.archived } });
    return { ok: true as const, data: null };
  }, input));
}

const templateInput = z.object({ trackerId: z.uuid(), name: z.string().trim().min(1).max(80), sharedWithSchool: z.boolean() });

/** Saves a tracker's columns (and its population, minus who) as a template for next time. */
export async function saveTrackerTemplate(db: Db, viewer: StaffViewer, input: z.input<typeof templateInput>): Promise<Result<{ id: string }>> {
  return wrap(() => runStaffAction(db, viewer, { permission: "trackers.create", input: templateInput }, async ({ tx, input: t, audit }) => {
    const found = await getTracker(tx, viewer, t.trackerId);
    if (!found) throw new Refused("That tracker wasn't found.");
    const fields = await tx.select().from(trackerFields).where(and(eq(trackerFields.trackerId, found.tracker.id))).orderBy(asc(trackerFields.position));
    const specs: FieldSpec[] = fields.filter((f) => !f.archivedAt).map((f): FieldSpec => {
      if (isStoredRule(f.computed)) return { type: "rule", label: f.label, all: f.computed.all };
      if (f.type === "computed") return { type: "computed", label: f.label, field: (f.computed as { field: string }).field, since: (f.computed as { since: string | null }).since };
      return { type: f.type as Exclude<FieldSpec["type"], "computed" | "rule">, label: f.label, options: f.options, sensitivity: f.sensitivity as Sensitivity };
    });
    const pop = populationOf(found.tracker);
    // Group and list populations are specific to a year; the template keeps the kind of population only.
    const population = pop.source === "group" || pop.source === "list" ? null : pop;
    const [row] = await tx.insert(trackerTemplates).values({
      schoolId: viewer.schoolId, createdBy: viewer.userId, name: t.name, description: found.tracker.description, fields: specs, population,
      ownerStaffId: viewer.staffId, sharedWithSchool: t.sharedWithSchool,
    }).returning({ id: trackerTemplates.id });
    await audit({ action: "tracker_template.create", entity: "tracker_templates", entityId: row!.id, after: { name: t.name, fromTracker: found.tracker.id, sharedWithSchool: t.sharedWithSchool } });
    return { ok: true as const, data: { id: row!.id } };
  }, input));
}

/** Templates the viewer can start from: their own and ones shared with the school. */
export async function templatesFor(db: Db, viewer: StaffViewer) {
  const rows = await db.select().from(trackerTemplates).where(eq(trackerTemplates.schoolId, viewer.schoolId)).orderBy(asc(trackerTemplates.name));
  return rows.filter((t) => !t.archivedAt && (t.sharedWithSchool || t.ownerStaffId === viewer.staffId)).map((t) => ({
    id: t.id, name: t.name, description: t.description, fields: z.array(fieldSpecSchema).parse(t.fields), population: t.population ? populationSchema.parse(t.population) : null, mine: t.ownerStaffId === viewer.staffId,
  }));
}
