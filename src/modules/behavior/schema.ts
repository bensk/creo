import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { staff } from "../../core/auth/schema";
import { base } from "../../core/db/base";
import { students } from "../students/schema";

// Basic tables arrive in Phase 1 to hold Schoolrunner history; logging behavior
// and restorative follow-ups arrive in Phase 4. Types are data, not code.

export const behaviorTypes = pgTable(
  "behavior_types",
  {
    ...base(),
    label: text("label").notNull(),
    valence: text("valence").notNull(),
    points: smallint("points").notNull().default(0),
    skill: text("skill"),
    requiresFollowup: boolean("requires_followup").notNull().default(false),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("behavior_types_label_idx").on(t.schoolId, t.label),
    index("behavior_types_created_by_idx").on(t.createdBy),
    check("behavior_types_valence_check", sql.raw(`valence in ('positive', 'negative')`)),
  ],
);

export const behaviorEvents = pgTable(
  "behavior_events",
  {
    ...base(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    typeId: uuid("type_id")
      .notNull()
      .references(() => behaviorTypes.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    location: text("location"),
    // Who saw it. created_by is who logged it (they can differ for imports).
    staffId: uuid("staff_id").references(() => staff.id),
    // Points at the time, so changing a type's points doesn't rewrite history.
    points: smallint("points").notNull(),
    narrative: text("narrative"),
    source: text("source").notNull().default("sis"),
  },
  (t) => [
    index("behavior_events_student_idx").on(t.studentId, t.occurredAt),
    index("behavior_events_school_occurred_idx").on(t.schoolId, t.occurredAt),
    index("behavior_events_type_idx").on(t.typeId),
    index("behavior_events_staff_idx").on(t.staffId),
    index("behavior_events_created_by_idx").on(t.createdBy),
    check("behavior_events_source_check", sql.raw(`source in ('sis', 'import')`)),
  ],
);
