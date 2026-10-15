import { and, eq, gte, lte } from "drizzle-orm";
import { registry } from "../../modules";
import { sensitiveReads } from "../audit/schema";
import type { Viewer } from "../auth/viewer";
import type { Db } from "../db/types";
import { schools } from "../identity/schema";
import { authorize, highestLevel } from "../permissions";
import { ROLE_SENSITIVITY } from "../permissions/matrix";
import type { Sensitivity } from "../permissions/sensitivity";
import { schoolYears } from "../school/schema";
import { compileQuery, QueryError, type CompiledColumn, type QueryAccess } from "./compile";
import type { FieldContext, FieldDef, SourceDef } from "./source";
import { querySpecSchema, type QuerySpecInput } from "./spec";

export { QueryError } from "./compile";

/** A source and every field any module adds to it (plus its data-defined fields, when a db is given). */
export async function sourceWithFields(id: string, load?: { db: Db; ctx: FieldContext }): Promise<{ source: SourceDef; fields: FieldDef[] }> {
  const source = registry.modules.flatMap((m) => m.sources ?? []).find((s) => s.id === id);
  if (!source) throw new QueryError(`Unknown source "${id}"`);
  const fields = registry.modules.flatMap((m) => m.sourceFields?.[id] ?? []);
  if (load && source.dynamicFields) fields.push(...(await source.dynamicFields(load.db, load.ctx)));
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.key)) throw new Error(`Two fields are named "${f.key}" on source "${id}"`);
    seen.add(f.key);
  }
  return { source, fields };
}

/** What a viewer may see in query results, from the role matrix. */
export function queryAccess(viewer: Viewer): QueryAccess {
  const everyRow = new Set<Sensitivity>();
  const assigned = new Set<Sensitivity>();
  if (viewer.kind === "staff" && viewer.hasAccess) {
    for (const role of viewer.roles) {
      ROLE_SENSITIVITY[role].all.forEach((l) => everyRow.add(l));
      ROLE_SENSITIVITY[role].assigned?.forEach((l) => assigned.add(l));
    }
  }
  for (const l of everyRow) assigned.delete(l);
  return { everyRow, assignedRows: assigned, staffId: viewer.kind === "staff" ? viewer.staffId : null };
}

export async function fieldContext(db: Db, schoolId: string): Promise<FieldContext> {
  const [school] = await db.select({ tz: schools.timezone }).from(schools).where(eq(schools.id, schoolId));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: school?.tz ?? "America/New_York" }).format(new Date());
  const [year] = await db
    .select({ startsOn: schoolYears.startsOn })
    .from(schoolYears)
    .where(and(eq(schoolYears.schoolId, schoolId), lte(schoolYears.startsOn, today), gte(schoolYears.endsOn, today)));
  return { schoolId, today, schoolYearStart: year?.startsOn ?? today };
}

/** Every field of a source this viewer can see at all (for column pickers and filter menus). */
export async function describeSource(db: Db, viewer: Viewer, sourceId: string): Promise<CompiledColumn[]> {
  const { source, fields } = await sourceWithFields(sourceId, { db, ctx: await fieldContext(db, viewer.schoolId) });
  const access = queryAccess(viewer);
  return fields.flatMap((f): CompiledColumn[] => {
    if (access.everyRow.has(f.sensitivity)) return [{ key: f.key, label: f.label, type: f.type, sensitivity: f.sensitivity, group: f.group, options: f.options, partial: false }];
    if (source.assigned && access.assignedRows.has(f.sensitivity)) return [{ key: f.key, label: f.label, type: f.type, sensitivity: f.sensitivity, group: f.group, options: f.options, partial: true }];
    return [];
  });
}

export async function defaultColumns(sourceId: string): Promise<string[]> {
  return (await sourceWithFields(sourceId)).fields.filter((f) => f.defaultVisible).map((f) => f.key);
}

export interface QueryResult {
  columns: CompiledColumn[];
  rows: { id: string; version: number | null; values: Record<string, unknown> }[];
}

/**
 * Runs a spec for a viewer: checks the source permission, compiles with their
 * access, and logs one sensitive_reads entry per above-standard column returned.
 */
export async function runQuery(db: Db, viewer: Viewer, input: QuerySpecInput, ctxOverride?: Partial<FieldContext>): Promise<QueryResult> {
  const parsed = querySpecSchema.safeParse(input);
  if (!parsed.success) throw new QueryError("That query isn't valid");
  const spec = parsed.data;
  const ctx = { ...(await fieldContext(db, viewer.schoolId)), ...ctxOverride };
  const { source, fields } = await sourceWithFields(spec.source, { db, ctx });
  await authorize(db, viewer, source.permission);

  const compiled = compileQuery(spec, source, fields, queryAccess(viewer), ctx);
  const raw = await db.execute<Record<string, unknown>>(compiled.sql);
  const rows = [...raw].map((r) => ({
    id: String(r.__id),
    version: r.__version === undefined ? null : Number(r.__version),
    values: Object.fromEntries(compiled.columns.map((c) => [c.key, r[`c:${c.key}`] ?? null])),
  }));

  const shown = compiled.columns.filter((c) => c.sensitivity !== "standard" && rows.some((r) => r.values[c.key] !== null));
  if (shown.length > 0) {
    await db.insert(sensitiveReads).values(
      shown.map((c) => ({ schoolId: viewer.schoolId, actorUserId: viewer.userId, entity: spec.source, entityId: null, field: c.key, via: "app" as const })),
    );
  }
  return { columns: compiled.columns, rows };
}


/**
 * The highest sensitivity among the fields a spec filters or sorts on. A list
 * or tracker built from it discloses that much about who's on it (e.g.
 * "students with an IEP"), whatever columns it shows.
 */
export async function specSensitivity(db: Db, schoolId: string, input: QuerySpecInput): Promise<Sensitivity> {
  const spec = querySpecSchema.parse(input);
  const { fields } = await sourceWithFields(spec.source, { db, ctx: await fieldContext(db, schoolId) });
  const used = new Set([...spec.filters.map((f) => f.field), ...spec.sort.map((s) => s.field)]);
  return highestLevel(fields.filter((f) => used.has(f.key)).map((f) => f.sensitivity));
}
