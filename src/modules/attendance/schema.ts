import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { base } from "../../core/db/base";
import { schoolYears } from "../../core/school/schema";
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
    /** When the student signed in at the late-arrivals desk. */
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("attendance_daily_student_date_idx").on(t.studentId, t.date),
    index("attendance_daily_school_date_idx").on(t.schoolId, t.date),
    index("attendance_daily_code_idx").on(t.codeId),
    index("attendance_daily_created_by_idx").on(t.createdBy),
    check("attendance_daily_source_check", sql.raw(`source in ('sis', 'import')`)),
  ],
);

export const SCHOOL_DAY_KINDS = ["full", "half", "other"] as const;

// The school calendar's exceptions. Weekdays in the school year are full
// school days and weekends are off unless a row here says otherwise: a day
// off, a half day, or another kind of day, with a note ("Thanksgiving").
export const schoolDays = pgTable(
  "school_days",
  {
    ...base(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id),
    date: date("date").notNull(),
    isInstructional: boolean("is_instructional").notNull().default(true),
    dayType: text("day_type").notNull().default("full"),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("school_days_date_idx").on(t.schoolId, t.date),
    index("school_days_year_idx").on(t.schoolYearId),
    index("school_days_created_by_idx").on(t.createdBy),
    check("school_days_type_check", sql.raw(`day_type in ('full', 'half', 'other')`)),
  ],
);
