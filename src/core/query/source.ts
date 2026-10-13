import type { SQL } from "drizzle-orm";
import type { Db } from "../db/types";
import type { Sensitivity } from "../permissions/sensitivity";
import type { Operator } from "./spec";

export type FieldType = "text" | "number" | "percent" | "date" | "boolean" | "enum" | "text_list";

/** What a field's SQL may refer to: the source's row alias (e.g. `s` for students). */
export interface FieldContext {
  schoolId: string;
  /** School-day "today" (school time zone), for "this year" and "current" fields. */
  today: string;
  schoolYearStart: string;
}

export interface FieldDef {
  key: string;
  /** Set for custom fields: the definition's key inside the row's custom data. */
  customKey?: string;
  label: string;
  type: FieldType;
  sensitivity: Sensitivity;
  /** Group in the column picker, e.g. "Student", "Attendance". */
  group: string;
  /** An SQL expression over the source row. Never built from user input. */
  select: (ctx: FieldContext) => SQL;
  /** Sort by this instead of the displayed value (e.g. last name for "name"). */
  sortBy?: (ctx: FieldContext) => SQL;
  options?: readonly string[];
  defaultVisible?: boolean;
}

export interface SourceDef {
  id: string;
  label: string;
  /** Permission needed to query this source at all. */
  permission: string;
  /** FROM clause; the main row is aliased `rowAlias`. */
  from: (ctx: FieldContext) => SQL;
  /** Row filter every query gets (school, and e.g. "enrolled this year"). */
  scope: (ctx: FieldContext) => SQL;
  rowAlias: string;
  /** Per-row id and version (optimistic concurrency) columns. */
  rowId: SQL;
  version?: SQL;
  /** Fields matched by free-text search. */
  searchFields: readonly string[];
  /** SQL true when the row is one the viewer works with (for "assigned only" sensitivity), given their staff id. */
  assigned?: (staffId: string, ctx: FieldContext) => SQL;
  defaultSort: readonly { field: string; dir: "asc" | "desc" }[];
  /** Fields defined as data (custom fields), loaded per query. */
  dynamicFields?: (db: Db, ctx: FieldContext) => Promise<FieldDef[]>;
}

export const OPERATORS_BY_TYPE: Readonly<Record<FieldType, readonly Operator[]>> = {
  text: ["eq", "neq", "contains", "starts_with", "in", "not_in", "is_empty", "is_not_empty"],
  number: ["eq", "neq", "in", "not_in", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  percent: ["gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  date: ["eq", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  boolean: ["is_true", "is_false"],
  enum: ["eq", "neq", "in", "not_in", "is_empty", "is_not_empty"],
  text_list: ["contains", "is_empty", "is_not_empty"],
};
