import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { base } from "../db/base";
import { citext, sqlList } from "../db/columns";
import { users } from "../identity/schema";

export const SHAREABLE_KINDS = ["list", "tracker", "dashboard"] as const;
export const SHARE_ACCESS = ["view", "edit"] as const;

// Who an item (a list, a tracker, later a dashboard) is shared with: one
// person, or everyone in a Google Group. created_by is who shared it. A share
// never widens access to fields: the item's sensitivity decides who may receive it.
export const shares = pgTable(
  "shares",
  {
    ...base(),
    objectKind: text("object_kind").notNull(),
    objectId: uuid("object_id").notNull(),
    userId: uuid("user_id").references(() => users.id),
    googleGroupEmail: citext("google_group_email"),
    access: text("access").notNull(),
  },
  (t) => [
    index("shares_object_idx").on(t.objectKind, t.objectId),
    index("shares_user_idx").on(t.userId),
    index("shares_group_idx").on(t.schoolId, t.googleGroupEmail),
    index("shares_created_by_idx").on(t.createdBy),
    check("shares_kind_check", sql.raw(`object_kind in (${sqlList(SHAREABLE_KINDS)})`)),
    check("shares_access_check", sql.raw(`access in (${sqlList(SHARE_ACCESS)})`)),
    check("shares_target_check", sql.raw(`(user_id is null) <> (google_group_email is null)`)),
  ],
);
