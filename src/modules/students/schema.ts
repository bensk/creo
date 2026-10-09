import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../../core/auth/schema";
import { base } from "../../core/db/base";
import { citext, sqlList } from "../../core/db/columns";
import { SENSITIVITY_LEVELS } from "../../core/permissions/sensitivity";
import { schoolYears } from "../../core/school/schema";

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
    // Cloud Storage object path; the image itself never lives in the database.
    photoObjectKey: text("photo_object_key"),
    // Optimistic concurrency for grid edits: an update must name the version it read.
    version: integer("version").notNull().default(1),
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

export const PRONUNCIATION_RECORDERS = ["staff", "student", "family"] as const;

// How a student's name is said. The newest row is current; older rows are kept.
// created_by is who recorded it; recorded_by_kind says whether that was staff,
// the student, or their family.
export const namePronunciations = pgTable(
  "name_pronunciations",
  {
    ...base(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    phonetic: text("phonetic"),
    audioObjectKey: text("audio_object_key"),
    language: text("language").notNull().default("en"),
    recordedByKind: text("recorded_by_kind").notNull(),
  },
  (t) => [
    index("name_pronunciations_student_idx").on(t.studentId, t.createdAt),
    index("name_pronunciations_school_idx").on(t.schoolId),
    index("name_pronunciations_created_by_idx").on(t.createdBy),
    check("name_pronunciations_kind_check", sql.raw(`recorded_by_kind in (${sqlList(PRONUNCIATION_RECORDERS)})`)),
    check("name_pronunciations_content_check", sql.raw(`phonetic is not null or audio_object_key is not null`)),
  ],
);

export const SUPPORT_TYPES = ["iep", "504", "ell", "other"] as const;

// IEP, 504, ELL, and other supports. The whole table is sensitive. Periods of
// the same type can't overlap for one student (see the constraints migration).
export const studentSupports = pgTable(
  "student_supports",
  {
    ...base(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    type: text("type").notNull(),
    details: text("details"),
    accommodations: text("accommodations").array().notNull().default(sql`'{}'::text[]`),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    source: text("source").notNull().default("manual"),
  },
  (t) => [
    index("student_supports_student_idx").on(t.studentId),
    index("student_supports_school_type_idx").on(t.schoolId, t.type),
    index("student_supports_created_by_idx").on(t.createdBy),
    check("student_supports_type_check", sql.raw(`type in (${sqlList(SUPPORT_TYPES)})`)),
    check("student_supports_source_check", sql.raw(`source in ('manual', 'import')`)),
    check("student_supports_dates_check", sql.raw(`ends_on is null or ends_on >= starts_on`)),
  ],
);

export const CUSTOM_FIELD_ENTITIES = ["students", "contacts"] as const;
export const CUSTOM_FIELD_TYPES = ["text", "long_text", "number", "date", "boolean", "select", "multi_select"] as const;

// Fields staff add without a migration. Values live in the entity's custom jsonb,
// keyed by `key`, and are validated by a Zod schema built from these rows.
export const customFieldDefinitions = pgTable(
  "custom_field_definitions",
  {
    ...base(),
    entity: text("entity").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    options: jsonb("options").notNull().default([]),
    required: boolean("required").notNull().default(false),
    sensitivity: text("sensitivity").notNull().default("standard"),
    helpText: text("help_text"),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("custom_field_definitions_key_idx").on(t.schoolId, t.entity, t.key),
    index("custom_field_definitions_created_by_idx").on(t.createdBy),
    check("custom_field_definitions_entity_check", sql.raw(`entity in (${sqlList(CUSTOM_FIELD_ENTITIES)})`)),
    check("custom_field_definitions_type_check", sql.raw(`type in (${sqlList(CUSTOM_FIELD_TYPES)})`)),
    check("custom_field_definitions_key_check", sql.raw(`key ~ '^[a-z][a-z0-9_]{0,62}$'`)),
    check("custom_field_definitions_sensitivity_check", sql.raw(`sensitivity in (${sqlList(SENSITIVITY_LEVELS)})`)),
  ],
);
