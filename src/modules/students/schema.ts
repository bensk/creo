import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../../core/auth/schema";
import { base } from "../../core/db/base";
import { citext } from "../../core/db/columns";
import { schoolYears } from "../../core/school/schema";

// Phase 0 carries core columns only; photo, pronunciation, and supports land in Phase 1.
export const students = pgTable(
  "students",
  {
    ...base(),
    userId: uuid("user_id")
      .unique()
      .references(() => users.id),
    legalFirstName: text("legal_first_name").notNull(),
    legalLastName: text("legal_last_name").notNull(),
    preferredFirstName: text("preferred_first_name"),
    preferredLastName: text("preferred_last_name"),
    pronouns: text("pronouns"),
    dateOfBirth: date("date_of_birth"),
    // NYC student ID. Sensitive (restricted). Nullable until assigned.
    osis: text("osis"),
    // Student Workspace account; sign-in matches it exactly.
    googleEmail: citext("google_email"),
    custom: jsonb("custom").notNull().default({}),
  },
  (t) => [
    uniqueIndex("students_school_osis_idx").on(t.schoolId, t.osis),
    uniqueIndex("students_school_google_email_idx").on(t.schoolId, t.googleEmail),
    index("students_created_by_idx").on(t.createdBy),
    check("students_osis_check", sql.raw(`osis is null or osis ~ '^[0-9]{9}$'`)),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    ...base(),
    userId: uuid("user_id")
      .unique()
      .references(() => users.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: citext("email"),
    phonePrimary: text("phone_primary"),
    phoneSecondary: text("phone_secondary"),
    language: text("language").notNull().default("en"),
    preferredChannel: text("preferred_channel"),
  },
  (t) => [
    index("contacts_school_idx").on(t.schoolId),
    index("contacts_email_idx").on(t.email),
    index("contacts_created_by_idx").on(t.createdBy),
    // Staff who are Creo parents use a personal email as family contacts.
    check(
      "contacts_email_not_creo_check",
      sql.raw(`email is null or email !~* '@([a-z0-9-]+\\.)*creoprep\\.org$'`),
    ),
    check(
      "contacts_preferred_channel_check",
      sql.raw(`preferred_channel is null or preferred_channel in ('email', 'phone', 'text', 'in_person')`),
    ),
  ],
);

// Effective-dated so custody and guardian changes keep their history.
export const studentContacts = pgTable(
  "student_contacts",
  {
    ...base(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    relationship: text("relationship").notNull(),
    isGuardian: boolean("is_guardian").notNull().default(false),
    livesWith: boolean("lives_with").notNull().default(false),
    pickupAllowed: boolean("pickup_allowed").notNull().default(false),
    contactPriority: smallint("contact_priority"),
    portalAccess: boolean("portal_access").notNull().default(false),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
  },
  (t) => [
    index("student_contacts_student_idx").on(t.studentId),
    index("student_contacts_contact_idx").on(t.contactId),
    index("student_contacts_school_idx").on(t.schoolId),
    index("student_contacts_created_by_idx").on(t.createdBy),
    check("student_contacts_dates_check", sql.raw(`ends_on is null or ends_on >= starts_on`)),
  ],
);

export const ENROLLMENT_STATUSES = ["active", "withdrawn", "completed"] as const;

// A student may withdraw and re-enroll within a year, so enrollments are
// periods (entry_date..exit_date) that may not overlap for one student.
export const enrollments = pgTable(
  "enrollments",
  {
    ...base(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id),
    gradeLevel: smallint("grade_level").notNull(),
    status: text("status").notNull(),
    entryDate: date("entry_date").notNull(),
    exitDate: date("exit_date"),
    entryCode: text("entry_code"),
    exitCode: text("exit_code"),
  },
  (t) => [
    index("enrollments_student_idx").on(t.studentId),
    index("enrollments_school_year_idx").on(t.schoolYearId, t.gradeLevel),
    index("enrollments_school_idx").on(t.schoolId),
    index("enrollments_created_by_idx").on(t.createdBy),
    check("enrollments_grade_check", sql.raw(`grade_level between 5 and 8`)),
    check("enrollments_status_check", sql.raw(`status in ('active', 'withdrawn', 'completed')`)),
    check("enrollments_dates_check", sql.raw(`exit_date is null or exit_date >= entry_date`)),
  ],
);
