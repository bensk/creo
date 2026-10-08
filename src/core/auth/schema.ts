import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { base, schoolId } from "../db/base";
import { citext, id, sqlList, STAFF_ROLES, timestamps } from "../db/columns";
import { users } from "../identity/schema";

export { users, USER_KINDS } from "../identity/schema";

export const SESSION_SURFACES = ["staff", "student", "family"] as const;
export const SIGN_IN_METHODS = ["google", "email_code", "dev"] as const;

export const staff = pgTable(
  "staff",
  {
    ...base(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    email: citext("email").notNull(),
    googleUserId: text("google_user_id").unique(),
    givenName: text("given_name").notNull(),
    familyName: text("family_name").notNull(),
    preferredName: text("preferred_name"),
    title: text("title"),
    status: text("status").notNull().default("active"),
    orgUnitPath: text("org_unit_path"),
    directorySyncedAt: timestamp("directory_synced_at", { withTimezone: true }),
    custom: jsonb("custom").notNull().default({}),
  },
  (t) => [
    uniqueIndex("staff_school_email_idx").on(t.schoolId, t.email),
    index("staff_created_by_idx").on(t.createdBy),
    check("staff_status_check", sql.raw(`status in ('active', 'inactive')`)),
  ],
);

// A person can hold several roles; permissions are the union. Directory sync
// only adds or ends rows with source = 'directory'; manual rows are never touched.
export const staffRoles = pgTable(
  "staff_roles",
  {
    ...base(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    role: text("role").notNull(),
    source: text("source").notNull(),
    sourceGroupEmail: citext("source_group_email"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
  },
  (t) => [
    index("staff_roles_staff_idx").on(t.staffId),
    index("staff_roles_school_idx").on(t.schoolId),
    index("staff_roles_created_by_idx").on(t.createdBy),
    check("staff_roles_role_check", sql.raw(`role in (${sqlList(STAFF_ROLES)})`)),
    check("staff_roles_source_check", sql.raw(`source in ('directory', 'manual')`)),
    check(
      "staff_roles_source_group_check",
      sql.raw(`(source = 'directory') = (source_group_email is not null)`),
    ),
    check("staff_roles_dates_check", sql.raw(`ends_on is null or ends_on >= starts_on`)),
  ],
);

// Google Group → role. Edited by admins.
export const roleGroupMappings = pgTable(
  "role_group_mappings",
  {
    ...base(),
    googleGroupEmail: citext("google_group_email").notNull(),
    role: text("role").notNull(),
  },
  (t) => [
    uniqueIndex("role_group_mappings_unique_idx").on(t.schoolId, t.googleGroupEmail, t.role),
    index("role_group_mappings_created_by_idx").on(t.createdBy),
    check("role_group_mappings_role_check", sql.raw(`role in (${sqlList(STAFF_ROLES)})`)),
  ],
);

// Only a SHA-256 hash of the session token is stored, so a copy of this table
// cannot be used to sign in. The user is the creator, so there is no created_by.
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    schoolId: schoolId(),
    ...timestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    surface: text("surface").notNull(),
    method: text("method").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_school_idx").on(t.schoolId),
    check("sessions_surface_check", sql.raw(`surface in (${sqlList(SESSION_SURFACES)})`)),
    check("sessions_method_check", sql.raw(`method in (${sqlList(SIGN_IN_METHODS)})`)),
  ],
);
