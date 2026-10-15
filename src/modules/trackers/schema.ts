import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { staff } from "../../core/auth/schema";
import { base } from "../../core/db/base";
import { sqlList } from "../../core/db/columns";
import { SENSITIVITY_LEVELS } from "../../core/permissions/sensitivity";
import { schoolYears } from "../../core/school/schema";
import { students } from "../students/schema";

export const POPULATION_KINDS = ["live", "snapshot"] as const;
export const POPULATION_SOURCES = ["all", "grade", "group", "list", "spec"] as const;
export const TRACKER_FIELD_TYPES = ["text", "long_text", "number", "date", "boolean", "select", "multi_select", "computed"] as const;

// A saved starting point: columns and a default population. "Save as template"
// makes next year's trip tracker two clicks.
export const trackerTemplates = pgTable(
  "tracker_templates",
  {
    ...base(),
    name: text("name").notNull(),
    description: text("description"),
    fields: jsonb("fields").notNull().default([]),
    population: jsonb("population"),
    ownerStaffId: uuid("owner_staff_id")
      .notNull()
      .references(() => staff.id),
    sharedWithSchool: boolean("shared_with_school").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("tracker_templates_owner_idx").on(t.ownerStaffId),
    index("tracker_templates_school_idx").on(t.schoolId),
    index("tracker_templates_created_by_idx").on(t.createdBy),
  ],
);

// A named table of students. Who's on it comes from a population (everyone,
// a grade, a group, a list, or a query-spec filter), live or fixed at
// creation. Sensitivity is the highest of its population filter and its
// columns; it decides who the tracker can be shared with.
export const trackers = pgTable(
  "trackers",
  {
    ...base(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id),
    name: text("name").notNull(),
    description: text("description"),
    ownerStaffId: uuid("owner_staff_id")
      .notNull()
      .references(() => staff.id),
    populationKind: text("population_kind").notNull(),
    populationSource: text("population_source").notNull(),
    populationRef: uuid("population_ref"),
    populationGrade: smallint("population_grade"),
    populationSpec: jsonb("population_spec"),
    sensitivity: text("sensitivity").notNull().default("standard"),
    templateId: uuid("template_id").references(() => trackerTemplates.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("trackers_year_idx").on(t.schoolYearId),
    index("trackers_owner_idx").on(t.ownerStaffId),
    index("trackers_template_idx").on(t.templateId),
    index("trackers_school_idx").on(t.schoolId),
    index("trackers_created_by_idx").on(t.createdBy),
    check("trackers_kind_check", sql.raw(`population_kind in (${sqlList(POPULATION_KINDS)})`)),
    check("trackers_source_check", sql.raw(`population_source in (${sqlList(POPULATION_SOURCES)})`)),
    check("trackers_grade_check", sql.raw(`(population_source = 'grade') = (population_grade is not null) and (population_grade is null or population_grade between 5 and 8)`)),
    check("trackers_ref_check", sql.raw(`(population_source in ('group', 'list')) = (population_ref is not null)`)),
    check("trackers_spec_check", sql.raw(`(population_source = 'spec') = (population_spec is not null)`)),
    check("trackers_sensitivity_check", sql.raw(`sensitivity in (${sqlList(SENSITIVITY_LEVELS)})`)),
  ],
);

// A tracker's columns: typed columns staff fill in, or computed columns that
// show a query-engine field (e.g. attendance rate since a date).
export const trackerFields = pgTable(
  "tracker_fields",
  {
    ...base(),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => trackers.id),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    options: text("options").array().notNull().default(sql`'{}'::text[]`),
    computed: jsonb("computed"),
    sensitivity: text("sensitivity").notNull().default("standard"),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tracker_fields_key_idx").on(t.trackerId, t.key),
    index("tracker_fields_school_idx").on(t.schoolId),
    index("tracker_fields_created_by_idx").on(t.createdBy),
    check("tracker_fields_type_check", sql.raw(`type in (${sqlList(TRACKER_FIELD_TYPES)})`)),
    check("tracker_fields_computed_check", sql.raw(`(type = 'computed') = (computed is not null)`)),
    check("tracker_fields_sensitivity_check", sql.raw(`sensitivity in (${sqlList(SENSITIVITY_LEVELS)})`)),
  ],
);

// One row per student. Values staff fill in live in data, keyed by field
// key, written one key at a time (jsonb_set) with a version check. A student
// who leaves a live tracker's population is archived, not deleted.
export const trackerRows = pgTable(
  "tracker_rows",
  {
    ...base(),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => trackers.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    data: jsonb("data").notNull().default({}),
    version: integer("version").notNull().default(1),
    addedOn: date("added_on").notNull(),
    archivedOn: date("archived_on"),
  },
  (t) => [
    uniqueIndex("tracker_rows_tracker_student_idx").on(t.trackerId, t.studentId),
    index("tracker_rows_student_idx").on(t.studentId),
    index("tracker_rows_school_idx").on(t.schoolId),
    index("tracker_rows_created_by_idx").on(t.createdBy),
  ],
);
