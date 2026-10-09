import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { base } from "../../core/db/base";
import { students } from "../students/schema";

// Daily homeroom attendance only (no period attendance). Basic tables arrive in
// Phase 1 to hold Schoolrunner history; taking attendance arrives in Phase 3.

export const ATTENDANCE_COUNTS_AS = ["present", "absent", "tardy", "excused"] as const;

export const attendanceCodes = pgTable(
  "attendance_codes",
  {
    ...base(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    countsAs: text("counts_as").notNull(),
    sirsCode: text("sirs_code"),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("attendance_codes_code_idx").on(t.schoolId, t.code),
    index("attendance_codes_created_by_idx").on(t.createdBy),
    check("attendance_codes_counts_as_check", sql.raw(`counts_as in ('present', 'absent', 'tardy', 'excused')`)),
  ],
);

export const attendanceDaily = pgTable(
  "attendance_daily",
  {
    ...base(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    date: date("date").notNull(),
    codeId: uuid("code_id")
      .notNull()
      .references(() => attendanceCodes.id),
    note: text("note"),
    source: text("source").notNull().default("sis"),
  },
  (t) => [
    uniqueIndex("attendance_daily_student_date_idx").on(t.studentId, t.date),
    index("attendance_daily_school_date_idx").on(t.schoolId, t.date),
    index("attendance_daily_code_idx").on(t.codeId),
    index("attendance_daily_created_by_idx").on(t.createdBy),
    check("attendance_daily_source_check", sql.raw(`source in ('sis', 'import')`)),
  ],
);
