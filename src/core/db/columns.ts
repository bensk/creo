import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

// Pure column helpers. This file must not import any table, so schema files can
// all depend on it without forming an import cycle. Columns that reference
// schools or users (school_id, created_by) live in ./base.ts.

// Case-insensitive text (Postgres citext extension). Used for every email.
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

export const STAFF_ROLES = ["admin", "leader", "ops", "teacher", "support", "coach"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** SQL list literal for CHECK constraints, e.g. `'a', 'b'`. Values are code constants, never user input. */
export function sqlList(values: readonly string[]): string {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
}

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
