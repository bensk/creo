import { z } from "zod";
import { SENSITIVITY_LEVELS } from "@/core/permissions/sensitivity";
import { querySpecSchema } from "@/core/query/spec";
import { ruleFieldSchema } from "./rules";
import type { trackerFields, trackers } from "./schema";

export type TrackerRow = typeof trackers.$inferSelect;
export type TrackerField = typeof trackerFields.$inferSelect;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const MAX_ROWS = 2000;

/** Who a tracker is about. */
export const populationSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("all"), kind: z.enum(["live", "snapshot"]) }),
  z.object({ source: z.literal("grade"), kind: z.enum(["live", "snapshot"]), grade: z.number().int().min(5).max(8) }),
  z.object({ source: z.literal("group"), kind: z.enum(["live", "snapshot"]), ref: z.uuid() }),
  z.object({ source: z.literal("list"), kind: z.enum(["live", "snapshot"]), ref: z.uuid() }),
  z.object({ source: z.literal("spec"), kind: z.enum(["live", "snapshot"]), spec: querySpecSchema }),
]);
export type Population = z.infer<typeof populationSchema>;

export const MANUAL_TYPES = ["text", "long_text", "number", "date", "boolean", "select", "multi_select"] as const;

/** A column as someone defines it: typed and filled in by staff, or computed from a student field. */
export const manualFieldSchema = z.object({
  type: z.enum(MANUAL_TYPES),
  label: z.string().trim().min(1).max(80),
  options: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  sensitivity: z.enum(SENSITIVITY_LEVELS).default("standard"),
});

export const computedFieldSchema = z.object({
  type: z.literal("computed"),
  label: z.string().trim().min(1).max(80),
  /** A students-source field key, e.g. "attendanceRate". */
  field: z.string().min(1).max(80),
  /** For "this year" fields: count from this date instead of the first day of school. */
  since: z.iso.date().nullable().default(null),
});

/** A column as someone defines it: typed and filled in by staff, computed from a student field, or a yes/no rule over other columns. */
export const fieldSpecSchema = z.union([computedFieldSchema, ruleFieldSchema, manualFieldSchema]);
export type FieldSpec = z.infer<typeof fieldSpecSchema>;

export function populationOf(t: TrackerRow): Population {
  const kind = t.populationKind as "live" | "snapshot";
  switch (t.populationSource) {
    case "grade": return { source: "grade", kind, grade: t.populationGrade! };
    case "group": return { source: "group", kind, ref: t.populationRef! };
    case "list": return { source: "list", kind, ref: t.populationRef! };
    case "spec": return { source: "spec", kind, spec: querySpecSchema.parse(t.populationSpec) };
    default: return { source: "all", kind };
  }
}
