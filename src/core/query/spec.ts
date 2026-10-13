import { z } from "zod";

// The one query language (CLAUDE.md): grid filters, saved views, lists, rules,
// and dashboard widgets all use this spec. Users and the AI only ever produce a
// spec; the compiler turns it into parameterized SQL from registered fields.

export const OPERATORS = [
  "eq", "neq", "in", "not_in", "contains", "starts_with", "gt", "gte", "lt", "lte", "between",
  "is_empty", "is_not_empty", "is_true", "is_false",
] as const;
export type Operator = (typeof OPERATORS)[number];

export const filterSchema = z.object({
  field: z.string().min(1).max(80),
  op: z.enum(OPERATORS),
  value: z.unknown().optional(),
});
export type Filter = z.infer<typeof filterSchema>;

export const querySpecSchema = z.object({
  source: z.string().min(1).max(40),
  filters: z.array(filterSchema).max(20).default([]),
  /** Free-text search over the source's search fields. */
  search: z.string().trim().max(100).optional(),
  sort: z.array(z.object({ field: z.string().min(1).max(80), dir: z.enum(["asc", "desc"]) })).max(3).default([]),
  /** Fields to return; the source's default columns when omitted. */
  columns: z.array(z.string().min(1).max(80)).max(80).optional(),
  limit: z.number().int().min(1).max(2000).default(1000),
});
export type QuerySpec = z.infer<typeof querySpecSchema>;
export type QuerySpecInput = z.input<typeof querySpecSchema>;
