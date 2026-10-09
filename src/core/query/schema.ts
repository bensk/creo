import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { base } from "../db/base";
import { users } from "../identity/schema";

// A saved grid view: a query spec (filters and sort), which columns to show,
// and who can use it. Applying a view still runs through permissions and
// sensitivity, so sharing a view never shares data someone can't already see.
export const savedViews = pgTable(
  "saved_views",
  {
    ...base(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    source: text("source").notNull(),
    spec: jsonb("spec").notNull(),
    columns: text("columns").array().notNull().default(sql`'{}'::text[]`),
    sharing: text("sharing").notNull().default("private"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("saved_views_owner_idx").on(t.ownerUserId, t.source),
    index("saved_views_school_source_idx").on(t.schoolId, t.source, t.sharing),
    index("saved_views_created_by_idx").on(t.createdBy),
    check("saved_views_sharing_check", sql.raw(`sharing in ('private', 'school')`)),
  ],
);
