import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { base } from "../../core/db/base";
import { sqlList } from "../../core/db/columns";

export const IMPORT_SOURCES = ["big_data_tracker", "schoolrunner", "clever"] as const;

// One row per import run. error_summary never contains student details.
export const importRuns = pgTable(
  "import_runs",
  {
    ...base(),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("running"),
    counts: jsonb("counts").notNull().default({}),
    errorSummary: text("error_summary"),
  },
  (t) => [
    index("import_runs_school_started_idx").on(t.schoolId, t.startedAt),
    index("import_runs_created_by_idx").on(t.createdBy),
    check("import_runs_source_check", sql.raw(`source in (${sqlList(IMPORT_SOURCES)})`)),
    check("import_runs_status_check", sql.raw(`status in ('running', 'succeeded', 'failed')`)),
  ],
);

// Links a record here to its ID in another system, so imports can be re-run
// safely (upsert by external ID). Each outside ID matches exactly one record.
export const externalIds = pgTable(
  "external_ids",
  {
    ...base(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
  },
  (t) => [
    uniqueIndex("external_ids_unique_idx").on(t.schoolId, t.source, t.entity, t.externalId),
    index("external_ids_entity_idx").on(t.entity, t.entityId),
    index("external_ids_created_by_idx").on(t.createdBy),
    check("external_ids_source_check", sql.raw(`source in (${sqlList(IMPORT_SOURCES)})`)),
  ],
);
