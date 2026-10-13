import { and, eq } from "drizzle-orm";
import { staff, staffRoles } from "@/core/auth/schema";
import { currentOn } from "@/core/db/dates";
import type { Db } from "@/core/db/types";
import { serverEnv } from "@/core/env";
import { users } from "@/core/identity/schema";
import { registry } from "..";
import { notificationBlocks, type DetailLevel, type NotificationContent } from "./blocks";
import { slackApi, slackConfigured, type SlackApi } from "./client";
import { slackChannelAllowlist, slackMessages, slackRules, slackUserLinks } from "./schema";

// The only way module code sends anything to Slack. Where a notification goes
// and at what detail comes from slack_rules (data). The privacy rules are
// enforced here, not left to callers:
//  - content is a headline, a list of students, and a link (see blocks.ts);
//    there is no field for anything else, so sensitive fields can't be sent
//  - names in a channel only if an admin allowlisted it for names and Slack
//    still reports it as private; otherwise names drop to initials
//  - every message is logged in slack_messages

export type SlackRule = typeof slackRules.$inferSelect;

export interface Delivery {
  ruleId: string;
  channel: string;
  detail: DetailLevel;
}

const NOTIFY_USER = "Slack notifications";

async function notifyUserId(db: Db, schoolId: string): Promise<string> {
  const [existing] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.schoolId, schoolId), eq(users.kind, "system"), eq(users.displayName, NOTIFY_USER)));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, schoolId, createdBy: id, kind: "system", displayName: NOTIFY_USER });
  return id;
}

/** The detail a channel may receive: names only in an allowlisted private channel. */
export async function allowedChannelDetail(db: Db, api: SlackApi, schoolId: string, channelId: string, wanted: DetailLevel): Promise<DetailLevel> {
  if (wanted !== "names") return wanted;
  const [entry] = await db.select().from(slackChannelAllowlist)
    .where(and(eq(slackChannelAllowlist.schoolId, schoolId), eq(slackChannelAllowlist.channelId, channelId)));
  if (!entry?.allowNames || !entry.isPrivate) return "initials";
  // A channel can be made public after it was approved: check with Slack each time.
  return (await api.isPrivateChannel(channelId)) === true ? "names" : "initials";
}

async function slackIdsForRole(db: Db, schoolId: string, role: string): Promise<string[]> {
  const rows = await db.selectDistinct({ slackUserId: slackUserLinks.slackUserId }).from(slackUserLinks)
    .innerJoin(staff, eq(staff.id, slackUserLinks.staffId))
    .innerJoin(staffRoles, eq(staffRoles.staffId, staff.id))
    .where(and(eq(slackUserLinks.schoolId, schoolId), eq(staff.status, "active"), eq(staffRoles.role, role), currentOn(staffRoles.startsOn, staffRoles.endsOn)));
  return rows.map((r) => r.slackUserId);
}

async function slackIdForStaff(db: Db, staffId: string): Promise<string | null> {
  const [row] = await db.select({ id: slackUserLinks.slackUserId }).from(slackUserLinks)
    .innerJoin(staff, eq(staff.id, slackUserLinks.staffId))
    .where(and(eq(slackUserLinks.staffId, staffId), eq(staff.status, "active")));
  return row?.id ?? null;
}

/** Sends one rule's message(s) and logs each. */
export async function deliver(
  db: Db, api: SlackApi, schoolId: string, rule: SlackRule, content: NotificationContent & { ownerStaffId?: string },
): Promise<Delivery[]> {
  const appUrl = serverEnv().APP_URL ?? "";
  const targets: { channel: string; detail: DetailLevel }[] = [];
  if (rule.target === "channel" && rule.channelId) {
    targets.push({ channel: rule.channelId, detail: await allowedChannelDetail(db, api, schoolId, rule.channelId, rule.detailLevel as DetailLevel) });
  } else {
    // A DM goes to one person, so the rule's detail level applies as set.
    const people = rule.target === "dm_role" && rule.dmRole
      ? await slackIdsForRole(db, schoolId, rule.dmRole)
      : content.ownerStaffId ? [await slackIdForStaff(db, content.ownerStaffId)].filter((x): x is string => Boolean(x)) : [];
    for (const person of people) targets.push({ channel: await api.openDm(person), detail: rule.detailLevel as DetailLevel });
  }

  const sent: Delivery[] = [];
  const by = targets.length ? await notifyUserId(db, schoolId) : null;
  for (const t of targets) {
    const message = notificationBlocks(appUrl, content, t.detail);
    const posted = await api.postMessage({ channel: t.channel, ...message });
    await db.insert(slackMessages).values({
      schoolId, createdBy: by!, channelId: posted.channel, ts: posted.ts, notificationType: rule.notificationType, detailLevel: t.detail,
    });
    sent.push({ ruleId: rule.id, channel: posted.channel, detail: t.detail });
  }
  return sent;
}

/**
 * Sends a module's notification wherever slack_rules say. Does nothing when
 * Slack isn't connected or no rule is enabled for the type.
 */
export async function notify(
  db: Db, schoolId: string, type: string, content: NotificationContent & { ownerStaffId?: string }, api?: SlackApi,
): Promise<Delivery[]> {
  if (!registry.notifications.some((n) => n.type === type)) throw new Error(`Unknown notification type "${type}"`);
  if (!api && !slackConfigured()) return [];
  const rules = await db.select().from(slackRules)
    .where(and(eq(slackRules.schoolId, schoolId), eq(slackRules.notificationType, type), eq(slackRules.enabled, true)));
  const client = api ?? slackApi();
  const sent: Delivery[] = [];
  for (const rule of rules) sent.push(...(await deliver(db, client, schoolId, rule, content)));
  return sent;
}

