import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import { STAFF_ROLES } from "@/core/db/columns";
import type { Db } from "@/core/db/types";
import { Forbidden } from "@/core/permissions";
import { registry } from "..";
import type { Result } from "../students/custom-fields";
import type { SlackApi } from "./client";
import { deliver } from "./notify";
import { slackChannelAllowlist, slackRules } from "./schema";

// Where notifications go (slack_rules) and which private channels may receive
// student names (slack_channel_allowlist). admin and leader manage rules;
// only admin can allow names in a channel.

const CHANNEL_ID = z.string().regex(/^[CG][A-Z0-9]{6,}$/, "Use the channel ID (it starts with C or G).");

export const ruleInput = z.object({
  id: z.uuid().optional(),
  notificationType: z.string().min(1),
  target: z.enum(["channel", "dm_role", "dm_owner"]),
  channelId: CHANNEL_ID.nullable(),
  dmRole: z.enum(STAFF_ROLES).nullable(),
  detailLevel: z.enum(["counts", "initials", "names"]),
  enabled: z.boolean(),
});

async function refusalsToResult<T>(work: () => Promise<Result<T>>, forbidden: string): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: forbidden };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

export async function listRules(db: Db, schoolId: string) {
  return db.select().from(slackRules).where(eq(slackRules.schoolId, schoolId)).orderBy(asc(slackRules.notificationType), asc(slackRules.createdAt));
}

export async function listAllowlist(db: Db, schoolId: string) {
  return db.select().from(slackChannelAllowlist).where(eq(slackChannelAllowlist.schoolId, schoolId)).orderBy(asc(slackChannelAllowlist.createdAt));
}

export async function saveRule(db: Db, viewer: StaffViewer, input: z.input<typeof ruleInput>): Promise<Result<{ id: string }>> {
  const parsed = ruleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That rule isn't valid." };
  const r = parsed.data;
  if (!registry.notifications.some((n) => n.type === r.notificationType)) return { ok: false, error: "That notification type doesn't exist." };
  if (r.target === "channel" && !r.channelId) return { ok: false, error: "Add the channel ID." };
  if (r.target === "dm_role" && !r.dmRole) return { ok: false, error: "Choose a role." };
  const values = {
    notificationType: r.notificationType, target: r.target, detailLevel: r.detailLevel, enabled: r.enabled,
    channelId: r.target === "channel" ? r.channelId : null, dmRole: r.target === "dm_role" ? r.dmRole : null,
  };
  return refusalsToResult(() => runStaffAction(db, viewer, { permission: "slack.manage", input: ruleInput }, async ({ tx, audit }) => {
    if (values.target === "channel" && values.detailLevel === "names") {
      const [entry] = await tx.select().from(slackChannelAllowlist)
        .where(and(eq(slackChannelAllowlist.schoolId, viewer.schoolId), eq(slackChannelAllowlist.channelId, values.channelId!)));
      if (!entry?.allowNames) throw new Refused("Names can only go to a private channel an admin has approved for names. Use initials or counts.");
    }
    if (r.id) {
      const [before] = await tx.select().from(slackRules).where(and(eq(slackRules.id, r.id), eq(slackRules.schoolId, viewer.schoolId)));
      if (!before) throw new Refused("That rule wasn't found.");
      await tx.update(slackRules).set(values).where(eq(slackRules.id, r.id));
      await audit({ action: "slack.rule_update", entity: "slack_rules", entityId: r.id, before, after: values });
      return { ok: true as const, data: { id: r.id } };
    }
    const [row] = await tx.insert(slackRules).values({ ...values, schoolId: viewer.schoolId, createdBy: viewer.userId }).returning({ id: slackRules.id });
    await audit({ action: "slack.rule_create", entity: "slack_rules", entityId: row!.id, after: values });
    return { ok: true as const, data: { id: row!.id } };
  }, r), "Only admins and leaders can change Slack notifications.");
}

export async function deleteRule(db: Db, viewer: StaffViewer, id: string): Promise<Result<null>> {
  return refusalsToResult(() => runStaffAction(db, viewer, { permission: "slack.manage", input: z.object({ id: z.uuid() }) }, async ({ tx, input, audit }) => {
    const [before] = await tx.delete(slackRules).where(and(eq(slackRules.id, input.id), eq(slackRules.schoolId, viewer.schoolId))).returning();
    if (!before) throw new Refused("That rule wasn't found.");
    await audit({ action: "slack.rule_delete", entity: "slack_rules", entityId: input.id, before });
    return { ok: true as const, data: null };
  }, { id }), "Only admins and leaders can change Slack notifications.");
}

/**
 * Approves a channel. Allowing names needs slack.allow_names (admin) and a
 * channel Slack reports as private.
 */
export async function approveChannel(db: Db, api: SlackApi, viewer: StaffViewer, input: { channelId: string; allowNames: boolean }): Promise<Result<null>> {
  const parsed = z.object({ channelId: CHANNEL_ID, allowNames: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That channel isn't valid." };
  const isPrivate = await api.isPrivateChannel(parsed.data.channelId);
  if (isPrivate === null) return { ok: false, error: "The SIS app can't see that channel. Add the app to the channel in Slack first." };
  if (parsed.data.allowNames && !isPrivate) return { ok: false, error: "Names are only allowed in private channels." };
  const permission = parsed.data.allowNames ? "slack.allow_names" : "slack.manage";
  return refusalsToResult(() => runStaffAction(db, viewer, { permission, input: z.object({ channelId: CHANNEL_ID, allowNames: z.boolean() }) }, async ({ tx, input: c, audit }) => {
    const values = { isPrivate, allowNames: c.allowNames, approvedBy: viewer.userId };
    await tx.insert(slackChannelAllowlist).values({ ...values, channelId: c.channelId, schoolId: viewer.schoolId, createdBy: viewer.userId })
      .onConflictDoUpdate({ target: [slackChannelAllowlist.schoolId, slackChannelAllowlist.channelId], set: values });
    await audit({ action: "slack.channel_approve", entity: "slack_channel_allowlist", after: { channelId: c.channelId, ...values } });
    return { ok: true as const, data: null };
  }, parsed.data), parsed.data.allowNames ? "Only admins can allow student names in a channel." : "Only admins and leaders can change Slack notifications.");
}

export async function removeChannel(db: Db, viewer: StaffViewer, channelId: string): Promise<Result<null>> {
  return refusalsToResult(() => runStaffAction(db, viewer, { permission: "slack.manage", input: z.object({ channelId: CHANNEL_ID }) }, async ({ tx, input, audit }) => {
    const [before] = await tx.delete(slackChannelAllowlist)
      .where(and(eq(slackChannelAllowlist.schoolId, viewer.schoolId), eq(slackChannelAllowlist.channelId, input.channelId))).returning();
    if (!before) throw new Refused("That channel isn't on the list.");
    // Rules that sent names there now fall back to initials when sending (see notify.ts).
    await audit({ action: "slack.channel_remove", entity: "slack_channel_allowlist", before });
    return { ok: true as const, data: null };
  }, { channelId }), "Only admins and leaders can change Slack notifications.");
}

/** Sends a test message through one rule, using the same path as every notification. */
export async function sendTest(db: Db, api: SlackApi, viewer: StaffViewer, ruleId: string): Promise<Result<{ sent: number }>> {
  return refusalsToResult(() => runStaffAction(db, viewer, { permission: "slack.manage", input: z.object({ id: z.uuid() }) }, async ({ tx, input, audit }) => {
    const [rule] = await tx.select().from(slackRules).where(and(eq(slackRules.id, input.id), eq(slackRules.schoolId, viewer.schoolId)));
    if (!rule) throw new Refused("That rule wasn't found.");
    const sent = await deliver(tx, api, viewer.schoolId, rule, {
      headline: `Test message from the SIS, sent by ${viewer.displayName}. Notifications for this rule will arrive here.`,
      path: "/slack",
      ownerStaffId: viewer.staffId,
    });
    await audit({ action: "slack.test_send", entity: "slack_rules", entityId: rule.id, after: { sent: sent.length } });
    return { ok: true as const, data: { sent: sent.length } };
  }, { id: ruleId }), "Only admins and leaders can send test messages.");
}
