import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { staff } from "../../core/auth/schema";
import { base } from "../../core/db/base";
import { citext, sqlList } from "../../core/db/columns";
import { SENSITIVITY_LEVELS } from "../../core/permissions/sensitivity";
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

// Courses and sections (classes). Imported from Clever's files today; later the
// SIS will write those files itself, so each keeps its Clever ID in external_ids.

export const courses = pgTable(
  "courses",
  {
    ...base(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id),
    name: text("name").notNull(),
    number: text("number"),
    subject: text("subject"),
    description: text("description"),
  },
  (t) => [
    uniqueIndex("courses_year_number_idx").on(t.schoolYearId, t.number),
    index("courses_school_idx").on(t.schoolId),
    index("courses_created_by_idx").on(t.createdBy),
  ],
);

export const sections = pgTable(
  "sections",
  {
    ...base(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id),
    courseId: uuid("course_id").references(() => courses.id),
    name: text("name").notNull(),
    sectionNumber: text("section_number"),
    period: text("period"),
    gradeLevel: smallint("grade_level"),
    termName: text("term_name"),
    termStartsOn: date("term_starts_on"),
    termEndsOn: date("term_ends_on"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("sections_year_idx").on(t.schoolYearId),
    index("sections_course_idx").on(t.courseId),
    index("sections_school_idx").on(t.schoolId),
    index("sections_created_by_idx").on(t.createdBy),
    check("sections_grade_check", sql.raw(`grade_level is null or grade_level between 5 and 8`)),
    check("sections_term_check", sql.raw(`term_ends_on is null or term_starts_on is null or term_ends_on >= term_starts_on`)),
  ],
);

export const SECTION_STAFF_ROLES = ["primary", "co_teacher"] as const;

// Who teaches a section. Effective-dated, so a change of teacher keeps history.
// Counts as an assignment: section teachers see sensitive fields (e.g.
// accommodations) for their section's students.
export const sectionStaff = pgTable(
  "section_staff",
  {
    ...base(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    role: text("role").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
  },
  (t) => [
    index("section_staff_section_idx").on(t.sectionId),
    index("section_staff_staff_idx").on(t.staffId),
    index("section_staff_school_idx").on(t.schoolId),
    index("section_staff_created_by_idx").on(t.createdBy),
    check("section_staff_role_check", sql.raw(`role in (${sqlList(SECTION_STAFF_ROLES)})`)),
    check("section_staff_dates_check", sql.raw(`ends_on is null or ends_on >= starts_on`)),
  ],
);

// Which students are in a section, effective-dated like group memberships.
export const sectionEnrollments = pgTable(
  "section_enrollments",
  {
    ...base(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
  },
  (t) => [
    index("section_enrollments_section_idx").on(t.sectionId),
    index("section_enrollments_student_idx").on(t.studentId),
    index("section_enrollments_school_idx").on(t.schoolId),
    index("section_enrollments_created_by_idx").on(t.createdBy),
    check("section_enrollments_dates_check", sql.raw(`ends_on is null or ends_on >= starts_on`)),
  ],
);

export const LIST_KINDS = ["static", "dynamic"] as const;

// A saved set of students. Static: picked by hand (members below, effective-
// dated). Dynamic: a query spec over the students source, evaluated when the
// list is opened. Sensitivity is the highest of the fields its filter uses;
// it decides who the list can be shared with.
export const lists = pgTable(
  "lists",
  {
    ...base(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind").notNull(),
    spec: jsonb("spec"),
    ownerStaffId: uuid("owner_staff_id")
      .notNull()
      .references(() => staff.id),
    sensitivity: text("sensitivity").notNull().default("standard"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("lists_year_idx").on(t.schoolYearId),
    index("lists_owner_idx").on(t.ownerStaffId),
    index("lists_school_idx").on(t.schoolId),
    index("lists_created_by_idx").on(t.createdBy),
    check("lists_kind_check", sql.raw(`kind in (${sqlList(LIST_KINDS)})`)),
    check("lists_spec_check", sql.raw(`(kind = 'dynamic') = (spec is not null)`)),
    check("lists_sensitivity_check", sql.raw(`sensitivity in (${sqlList(SENSITIVITY_LEVELS)})`)),
  ],
);

export const listMembers = pgTable(
  "list_members",
  {
    ...base(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
  },
  (t) => [
    index("list_members_list_idx").on(t.listId),
    index("list_members_student_idx").on(t.studentId),
    index("list_members_school_idx").on(t.schoolId),
    index("list_members_created_by_idx").on(t.createdBy),
    check("list_members_dates_check", sql.raw(`ends_on is null or ends_on >= starts_on`)),
  ],
);
