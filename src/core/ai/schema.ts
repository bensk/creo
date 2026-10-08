import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth/schema";
import { base } from "../db/base";
import { sqlList, STAFF_ROLES } from "../db/columns";

// Written only by the ai:grant / ai:revoke CLI. A row targets exactly one staff
// role or one user. features = null means every AI feature. Grants are ended
// (ended_at), never deleted, so the history stays. created_by/created_at record
// who granted it and when.
export const aiGrants = pgTable(
  "ai_grants",
  {
    ...base(),
    role: text("role"),
    userId: uuid("user_id").references(() => users.id),
    effect: text("effect").notNull(),
    features: text("features").array(),
    note: text("note"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedBy: uuid("ended_by").references(() => users.id),
  },
  (t) => [
    index("ai_grants_school_idx").on(t.schoolId),
    index("ai_grants_user_idx").on(t.userId),
    index("ai_grants_created_by_idx").on(t.createdBy),
    index("ai_grants_ended_by_idx").on(t.endedBy),
    check("ai_grants_target_check", sql.raw(`num_nonnulls(role, user_id) = 1`)),
    check("ai_grants_role_check", sql.raw(`role is null or role in (${sqlList(STAFF_ROLES)})`)),
    check("ai_grants_effect_check", sql.raw(`effect in ('grant', 'revoke')`)),
    check("ai_grants_ended_check", sql.raw(`(ended_at is null) = (ended_by is null)`)),
  ],
);
