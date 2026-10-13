import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/core/db/types";
import { attendanceCodes, attendanceDaily } from "./schema";

// Public reads for other modules (e.g. the student profile timeline).

/** Recent days a student wasn't simply present (absent, excused, tardy), newest first. */
export async function recentAttendanceExceptions(db: Db, studentId: string, limit = 30) {
  return db
    .select({ id: attendanceDaily.id, date: attendanceDaily.date, label: attendanceCodes.label, countsAs: attendanceCodes.countsAs, note: attendanceDaily.note })
    .from(attendanceDaily)
    .innerJoin(attendanceCodes, eq(attendanceCodes.id, attendanceDaily.codeId))
    .where(and(eq(attendanceDaily.studentId, studentId), ne(attendanceCodes.countsAs, "present")))
    .orderBy(desc(attendanceDaily.date))
    .limit(limit);
}

/** Days recorded since a date, by what they count as. */
export async function attendanceSummary(db: Db, studentId: string, since: string) {
  const rows = await db
    .select({ countsAs: attendanceCodes.countsAs, days: sql<number>`count(*)::int` })
    .from(attendanceDaily)
    .innerJoin(attendanceCodes, eq(attendanceCodes.id, attendanceDaily.codeId))
    .where(and(eq(attendanceDaily.studentId, studentId), sql`${attendanceDaily.date} >= ${since}::date`))
    .groupBy(attendanceCodes.countsAs);
  const by = Object.fromEntries(rows.map((r) => [r.countsAs, r.days])) as Partial<Record<string, number>>;
  const present = by.present ?? 0, tardy = by.tardy ?? 0, absent = by.absent ?? 0, excused = by.excused ?? 0;
  const total = present + tardy + absent + excused;
  return { total, present, tardy, absent, excused, rate: total ? Math.round((1000 * (present + tardy)) / total) / 10 : null };
}
