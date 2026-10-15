import { sql, type SQL } from "drizzle-orm";
import type { Sensitivity } from "../permissions/sensitivity";
import { OPERATORS_BY_TYPE, type FieldContext, type FieldDef, type SourceDef } from "./source";
import type { Filter, QuerySpec } from "./spec";

/** A spec that can't run as asked; the message is safe to show the person. */
export class QueryError extends Error {}

/** What the viewer may see, decided by core/permissions before compiling. */
export interface QueryAccess {
  /** Levels the viewer sees for every row. */
  everyRow: ReadonlySet<Sensitivity>;
  /** Extra levels the viewer sees only for rows they work with (teachers: sensitive). */
  assignedRows: ReadonlySet<Sensitivity>;
  staffId: string | null;
}

export interface CompiledColumn {
  key: string;
  label: string;
  type: FieldDef["type"];
  sensitivity: Sensitivity;
  group: string;
  options?: readonly string[];
  /** True when values appear only for some rows (the viewer's own students). */
  partial: boolean;
}

export interface CompiledQuery {
  sql: SQL;
  columns: CompiledColumn[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkValue(field: FieldDef, filter: Filter): unknown {
  const { op, value } = filter;
  const fail = (what: string): never => {
    throw new QueryError(`Filter on "${field.label}" needs ${what}`);
  };
  if (["is_empty", "is_not_empty", "is_true", "is_false"].includes(op)) return undefined;
  const scalar = (v: unknown) => {
    if (field.type === "number" || field.type === "percent") {
      if (typeof v !== "number" || !Number.isFinite(v)) fail("a number");
      return v;
    }
    if (field.type === "date") {
      if (typeof v !== "string" || !ISO_DATE.test(v)) fail("a date (YYYY-MM-DD)");
      return v;
    }
    if (typeof v !== "string" || v.length > 200) fail("text");
    if (field.type === "enum" && field.options && !field.options.includes(v as string)) fail(`one of: ${field.options.join(", ")}`);
    return v;
  };
  if (op === "in" || op === "not_in") {
    // Hidden id fields are how features ask for exact rows (a tracker's students), so they allow more.
    if (!Array.isArray(value) || value.length === 0 || value.length > (field.hidden ? 2000 : 100)) fail("a list of values");
    return (value as unknown[]).map(scalar);
  }
  if (op === "between") {
    if (!Array.isArray(value) || value.length !== 2) fail("two values");
    return (value as unknown[]).map(scalar);
  }
  return scalar(value);
}

function condition(expr: SQL, field: FieldDef, filter: Filter): SQL {
  const v = checkValue(field, filter);
  const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
  switch (filter.op) {
    case "eq": return sql`${expr} = ${v}`;
    case "neq": return sql`${expr} is distinct from ${v}`;
    case "in": return sql`${expr} in (${sql.join((v as unknown[]).map((x) => sql`${x}`), sql`, `)})`;
    case "not_in": return sql`(${expr} is null or ${expr} not in (${sql.join((v as unknown[]).map((x) => sql`${x}`), sql`, `)}))`;
    case "contains":
      return field.type === "text_list" ? sql`${v} = any(${expr})` : sql`${expr} ilike ${`%${like(v as string)}%`}`;
    case "starts_with": return sql`${expr} ilike ${`${like(v as string)}%`}`;
    case "gt": return sql`${expr} > ${v}`;
    case "gte": return sql`${expr} >= ${v}`;
    case "lt": return sql`${expr} < ${v}`;
    case "lte": return sql`${expr} <= ${v}`;
    case "between": {
      const [a, b] = v as [unknown, unknown];
      return sql`${expr} between ${a} and ${b}`;
    }
    case "is_empty":
      return field.type === "text_list" ? sql`coalesce(cardinality(${expr}), 0) = 0` : sql`(${expr} is null or ${expr}::text = '')`;
    case "is_not_empty":
      return field.type === "text_list" ? sql`coalesce(cardinality(${expr}), 0) > 0` : sql`(${expr} is not null and ${expr}::text <> '')`;
    case "is_true": return sql`${expr} is true`;
    case "is_false": return sql`${expr} is not true`;
  }
}

/**
 * Compiles a spec for one viewer. Columns the viewer can't see are left out;
 * columns they can see only for their own students come back empty for
 * everyone else. Filtering or sorting on a field requires seeing it for every
 * row, because a filter on "has an IEP" would otherwise reveal who has one.
 */
export function compileQuery(
  spec: QuerySpec,
  source: SourceDef,
  fields: readonly FieldDef[],
  access: QueryAccess,
  ctx: FieldContext,
): CompiledQuery {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const field = (key: string) => {
    const f = byKey.get(key);
    if (!f) throw new QueryError(`Unknown field "${key}"`);
    return f;
  };
  const assigned = access.staffId && source.assigned ? source.assigned(access.staffId, ctx) : null;
  const visibility = (f: FieldDef): "all" | "assigned" | "none" =>
    access.everyRow.has(f.sensitivity) ? "all" : assigned && access.assignedRows.has(f.sensitivity) ? "assigned" : "none";

  const requested = spec.columns ?? fields.filter((f) => f.defaultVisible).map((f) => f.key);
  const columns: CompiledColumn[] = [];
  const selects: SQL[] = [sql`${source.rowId} as "__id"`];
  if (source.version) selects.push(sql`${source.version} as "__version"`);
  for (const key of [...new Set(requested)]) {
    const f = field(key);
    const vis = visibility(f);
    if (vis === "none") continue; // not visible to this viewer at all
    const expr = vis === "all" ? f.select(ctx) : sql`case when ${assigned} then ${f.select(ctx)} end`;
    selects.push(sql`${expr} as ${sql.identifier(`c:${f.key}`)}`);
    columns.push({ key: f.key, label: f.label, type: f.type, sensitivity: f.sensitivity, group: f.group, options: f.options, partial: vis === "assigned" });
  }

  const where: SQL[] = [source.scope(ctx)];
  for (const filter of spec.filters) {
    const f = field(filter.field);
    if (visibility(f) !== "all") throw new QueryError(`You can't filter on "${f.label}"`);
    if (!OPERATORS_BY_TYPE[f.type].includes(filter.op)) throw new QueryError(`"${filter.op}" doesn't apply to "${f.label}"`);
    where.push(condition(f.select(ctx), f, filter));
  }
  if (spec.search) {
    const words = spec.search.split(/\s+/).filter(Boolean).slice(0, 5);
    const haystack = sql.join(
      source.searchFields.map((k) => sql`coalesce(${field(k).select(ctx)}::text, '')`),
      sql` || ' ' || `,
    );
    for (const w of words) where.push(sql`(${haystack}) ilike ${`%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`);
  }

  const sorts = spec.sort.length > 0 ? spec.sort : source.defaultSort;
  const orderBy: SQL[] = sorts.map((s) => {
    const f = field(s.field);
    if (visibility(f) !== "all") throw new QueryError(`You can't sort by "${f.label}"`);
    const expr = (f.sortBy ?? f.select)(ctx);
    return s.dir === "asc" ? sql`${expr} asc nulls last` : sql`${expr} desc nulls last`;
  });
  orderBy.push(sql`${source.rowId}`); // stable order

  const query = sql`select ${sql.join(selects, sql`, `)} from ${source.from(ctx)} where ${sql.join(where, sql` and `)} order by ${sql.join(orderBy, sql`, `)} limit ${spec.limit}`;
  return { sql: query, columns };
}
