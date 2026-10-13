import { sql } from "drizzle-orm";
import type { FieldDef } from "@/core/query/source";

// Behavior this school year, added to the "students" source. Narratives are never exposed here.
const points = (ctx: { schoolYearStart: string }, valence: string | null) =>
  sql`(select coalesce(sum(be.points), 0)::int from behavior_events be join behavior_types bt on bt.id = be.type_id
    where be.student_id = s.id and be.occurred_at >= ${ctx.schoolYearStart}::date ${valence ? sql`and bt.valence = ${valence}` : sql``})`;

export const behaviorStudentFields: FieldDef[] = [
  { key: "netPoints", label: "Behavior points", type: "number", sensitivity: "standard", group: "Behavior", defaultVisible: true, select: (ctx) => points(ctx, null) },
  { key: "positivePoints", label: "Positive points", type: "number", sensitivity: "standard", group: "Behavior", select: (ctx) => points(ctx, "positive") },
  { key: "negativePoints", label: "Negative points", type: "number", sensitivity: "standard", group: "Behavior", select: (ctx) => points(ctx, "negative") },
];
