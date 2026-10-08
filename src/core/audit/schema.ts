import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth/schema";
import { schoolId } from "../db/base";
import { id, sqlList } from "../db/columns";

export const AUDIT_VIA = ["app", "slack", "cli", "import", "dev", "system"] as const;

// Append-only and kept forever. The app's database role cannot update, delete,
// or truncate these tables, and a trigger blocks it for every role (see the
// audit migration). No updated_at or created_by: actor_user_id and at say it all.
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    schoolId: schoolId(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    via: text("via").notNull(),
    requestId: text("request_id"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_school_at_idx").on(t.schoolId, t.at),
    index("audit_log_entity_idx").on(t.entity, t.entityId),
    index("audit_log_actor_at_idx").on(t.actorUserId, t.at),
    check("audit_log_via_check", sql.raw(`via in (${sqlList(AUDIT_VIA)})`)),
  ],
);

export const sensitiveReads = pgTable(
  "sensitive_reads",
  {
    id: id(),
    schoolId: schoolId(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    field: text("field").notNull(),
    via: text("via").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sensitive_reads_school_at_idx").on(t.schoolId, t.at),
    index("sensitive_reads_entity_idx").on(t.entity, t.entityId),
    index("sensitive_reads_actor_at_idx").on(t.actorUserId, t.at),
    check("sensitive_reads_via_check", sql.raw(`via in (${sqlList(AUDIT_VIA)})`)),
  ],
);
