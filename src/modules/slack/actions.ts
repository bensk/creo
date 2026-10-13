"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { slackApi, slackConfigured } from "./client";
import { approveChannel, deleteRule, removeChannel, saveRule, sendTest, type ruleInput } from "./rules";
import type { z } from "zod";

const NOT_CONNECTED = { ok: false as const, error: "Slack isn't connected yet." };

export async function saveRuleAction(input: z.input<typeof ruleInput>) {
  const result = await saveRule(getDb(), await requireViewer("staff"), input);
  if (result.ok) revalidatePath("/slack");
  return result;
}

export async function deleteRuleAction(id: string) {
  const result = await deleteRule(getDb(), await requireViewer("staff"), id);
  if (result.ok) revalidatePath("/slack");
  return result;
}

export async function sendTestAction(ruleId: string) {
  const viewer = await requireViewer("staff");
  if (!slackConfigured()) return NOT_CONNECTED;
  return sendTest(getDb(), slackApi(), viewer, ruleId);
}

export async function approveChannelAction(input: { channelId: string; allowNames: boolean }) {
  const viewer = await requireViewer("staff");
  if (!slackConfigured()) return NOT_CONNECTED;
  const result = await approveChannel(getDb(), slackApi(), viewer, input);
  if (result.ok) revalidatePath("/slack");
  return result;
}

export async function removeChannelAction(channelId: string) {
  const result = await removeChannel(getDb(), await requireViewer("staff"), channelId);
  if (result.ok) revalidatePath("/slack");
  return result;
}
