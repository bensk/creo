import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, id, sqlList, timestamps } from "../db/columns";

// The two tables every other table references (school_id, created_by). They
// live together, importing no other schema, so table definitions never form
// an import cycle.

// The one table without school_id or created_by: schools are created by setup, not by a user.
export const schools = pgTable("schools", {
  id: id(),
  name: text("name").notNull(),
  dbn: text("dbn").notNull().unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
  ...timestamps(),
});

export const USER_KINDS = ["staff", "student", "family", "system"] as const;

// One row per sign-in identity, and the actor for sessions, audit, AI grants,
// and shares. Staff, students, and contacts point here through their user_id.
// System users (importers, CLIs) have kind = 'system' and no email.
export const users = pgTable(
  "users",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    ...timestamps(),
    // Self-reference: the first system user is created by itself.
    createdBy: uuid("created_by")
      .notNull()
      .references((): AnyPgColumn => users.id),
    kind: text("kind").notNull(),
    email: citext("email"),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
  },
  (t) => [
    check("users_kind_check", sql.raw(`kind in (${sqlList(USER_KINDS)})`)),
    check("users_status_check", sql.raw(`status in ('active', 'disabled')`)),
    check("users_email_check", sql.raw(`(kind = 'system') = (email is null)`)),
    // Staff and student emails are unique. Whether two family contacts may
    // share one email is decided with family sign-in (Phase 5).
    uniqueIndex("users_staff_student_email_idx")
      .on(t.schoolId, t.email)
      .where(sql.raw(`kind in ('staff', 'student')`)),
    index("users_email_idx").on(t.email),
    index("users_school_idx").on(t.schoolId),
    index("users_created_by_idx").on(t.createdBy),
  ],
);
