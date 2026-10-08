import { sql } from "drizzle-orm";
import { check, date, index, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { staff } from "../../core/auth/schema";
import { base } from "../../core/db/base";
import { citext, sqlList } from "../../core/db/columns";
import { schoolYears } from "../../core/school/schema";
import { students } from "../students/schema";

export const GROUP_TYPES = ["homeroom", "grade_team", "advisory", "intervention", "club", "team", "custom"] as const;
export const GROUP_STAFF_FUNCTIONS = ["homeroom_teacher", "lead", "member"] as const;

export const groups = pgTable(
  "groups",
  {
    ...base(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id),
    type: text("type").notNull(),
    name: text("name").notNull(),
    gradeLevel: smallint("grade_level"),
    ownerStaffId: uuid("owner_staff_id").references(() => staff.id),
    googleGroupEmail: citext("google_group_email"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("groups_year_type_name_idx").on(t.schoolYearId, t.type, t.name),
    index("groups_school_idx").on(t.schoolId),
    index("groups_owner_idx").on(t.ownerStaffId),
    index("groups_created_by_idx").on(t.createdBy),
    check("groups_type_check", sql.raw(`type in (${sqlList(GROUP_TYPES)})`)),
    check("groups_grade_check", sql.raw(`grade_level is null or grade_level between 5 and 8`)),
  ],
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    ...base(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
  },
  (t) => [
    index("group_memberships_group_idx").on(t.groupId),
    index("group_memberships_student_idx").on(t.studentId),
    index("group_memberships_school_idx").on(t.schoolId),
    index("group_memberships_created_by_idx").on(t.createdBy),
    check("group_memberships_dates_check", sql.raw(`ends_on is null or ends_on >= starts_on`)),
  ],
);

// Which staff work with a group. Drives "my classes" / "my homeroom" views, which
// students' sensitive fields a teacher sees, and homeroom attendance rights.
export const groupStaff = pgTable(
  "group_staff",
  {
    ...base(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    function: text("function").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
  },
  (t) => [
    index("group_staff_group_idx").on(t.groupId),
    index("group_staff_staff_idx").on(t.staffId),
    index("group_staff_school_idx").on(t.schoolId),
    index("group_staff_created_by_idx").on(t.createdBy),
    check("group_staff_function_check", sql.raw(`function in (${sqlList(GROUP_STAFF_FUNCTIONS)})`)),
    check("group_staff_dates_check", sql.raw(`ends_on is null or ends_on >= starts_on`)),
  ],
);
