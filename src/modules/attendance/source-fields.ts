import { sql } from "drizzle-orm";
import type { FieldDef } from "@/core/query/source";

// Attendance this school year, added to the "students" source.
const days = (ctx: { schoolYearStart: string; today: string }, countsAs: string) =>
  sql`(select count(*)::int from attendance_daily ad join attendance_codes ac on ac.id = ad.code_id
    where ad.student_id = s.id and ad.date between ${ctx.schoolYearStart}::date and ${ctx.today}::date and ac.counts_as in (${sql.raw(countsAs)}))`;

export const attendanceStudentFields: FieldDef[] = [
  {
    key: "attendanceRate", label: "Attendance rate", type: "percent", sensitivity: "standard", group: "Attendance", defaultVisible: true,
    // Present or tardy over all recorded days this year. Null before any day is recorded.
    select: (ctx) => sql`round(100.0 * ${days(ctx, "'present','tardy'")} / nullif(${days(ctx, "'present','tardy','absent','excused'")}, 0), 1)`,
  },
  { key: "absences", label: "Absences", type: "number", sensitivity: "standard", group: "Attendance", defaultVisible: true,
    select: (ctx) => days(ctx, "'absent','excused'") },
  { key: "tardies", label: "Tardies", type: "number", sensitivity: "standard", group: "Attendance", select: (ctx) => days(ctx, "'tardy'") },
];
