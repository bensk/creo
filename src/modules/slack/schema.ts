import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { staff, users } from "../../core/auth/schema";
import { base } from "../../core/db/base";

// The workspace install. The bot token lives in Secret Manager; this row only names the secret.
export const slackInstallation = pgTable(
  "slack_installation",
  {
    ...base(),
    teamId: text("team_id").notNull(),
    botTokenSecret: text("bot_token_secret").notNull(),
    installedBy: uuid("installed_by")
      .notNull()
      .references(() => users.id),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [
    uniqueIndex("slack_installation_team_idx").on(t.schoolId, t.teamId),
    index("slack_installation_installed_by_idx").on(t.installedBy),
    index("slack_installation_created_by_idx").on(t.createdBy),
  ],
);

// Slack users linked to staff by verified Workspace email.
export const slackUserLinks = pgTable(
  "slack_user_links",
  {
    ...base(),
    staffId: uuid("staff_id")
      .notNull()
      .unique()
      .references(() => staff.id),
    slackUserId: text("slack_user_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("slack_user_links_slack_user_idx").on(t.schoolId, t.slackUserId),
    index("slack_user_links_created_by_idx").on(t.createdBy),
  ],
);

// Where each module's notification types go, how often, and at what detail. Editable by admin and leaders.
export const slackRules = pgTable(
  "slack_rules",
  {
    ...base(),
    notificationType: text("notification_type").notNull(),
    target: text("target").notNull(),
    channelId: text("channel_id"),
    dmRole: text("dm_role"),
    schedule: text("schedule"),
    detailLevel: text("detail_level").notNull().default("counts"),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [
    index("slack_rules_type_idx").on(t.schoolId, t.notificationType),
    index("slack_rules_created_by_idx").on(t.createdBy),
    check("slack_rules_target_check", sql.raw(`target in ('channel', 'dm_role', 'dm_owner')`)),
    check("slack_rules_detail_check", sql.raw(`detail_level in ('counts', 'initials', 'names')`)),
    check("slack_rules_channel_check", sql.raw(`(target = 'channel') = (channel_id is not null)`)),
    check("slack_rules_dm_role_check", sql.raw(`(target = 'dm_role') = (dm_role is not null)`)),
  ],
);

// Private channels an admin has approved for posts with student names.
export const slackChannelAllowlist = pgTable(
  "slack_channel_allowlist",
  {
    ...base(),
    channelId: text("channel_id").notNull(),
    isPrivate: boolean("is_private").notNull(),
    allowNames: boolean("allow_names").notNull().default(false),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    uniqueIndex("slack_channel_allowlist_channel_idx").on(t.schoolId, t.channelId),
    index("slack_channel_allowlist_approved_by_idx").on(t.approvedBy),
    index("slack_channel_allowlist_created_by_idx").on(t.createdBy),
    // Names only ever go to private channels.
    check("slack_channel_allowlist_names_check", sql.raw(`not allow_names or is_private`)),
  ],
);

// Every message the SIS sends, so it can be audited and deleted.
export const slackMessages = pgTable(
  "slack_messages",
  {
    ...base(),
    channelId: text("channel_id").notNull(),
    ts: text("ts").notNull(),
    notificationType: text("notification_type").notNull(),
    detailLevel: text("detail_level").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("slack_messages_channel_ts_idx").on(t.schoolId, t.channelId, t.ts),
    index("slack_messages_sent_idx").on(t.schoolId, t.sentAt),
    index("slack_messages_created_by_idx").on(t.createdBy),
    check("slack_messages_detail_check", sql.raw(`detail_level in ('counts', 'initials', 'names')`)),
  ],
);
