import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { registry } from "@/modules";
import { slackApi, slackConfigured } from "@/modules/slack/client";
import { listAllowlist, listRules } from "@/modules/slack/rules";
import { SlackSettings } from "@/modules/slack/ui/SlackSettings";

export const metadata = { title: "Slack" };

export default async function SlackPage() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await can(db, viewer, "slack.manage"))) notFound();
  const [rules, channels, canAllowNames] = await Promise.all([
    listRules(db, viewer.schoolId),
    listAllowlist(db, viewer.schoolId),
    can(db, viewer, "slack.allow_names"),
  ]);
  const workspace = slackConfigured() ? await slackApi().workspace() : null;
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Slack</h1>
        <p className="max-w-2xl">
          Choose where SIS notifications go and how much they say. Channel posts show counts by default. Student names only go to private channels an admin has approved, and sensitive information never goes to Slack.
        </p>
        <p className="voice text-sm text-ink-muted">
          {!slackConfigured() ? "slack isn't connected. see docs/setup/slack.md." : workspace ? `connected to ${workspace.team}` : "slack is configured, but the bot token didn't work."}
        </p>
      </header>
      <SlackSettings
        types={registry.notifications.map((n) => ({ type: n.type, label: n.label, description: n.description }))}
        rules={rules.map((r) => ({
          id: r.id, notificationType: r.notificationType, target: r.target as "channel" | "dm_role" | "dm_owner",
          channelId: r.channelId, dmRole: r.dmRole, detailLevel: r.detailLevel as "counts" | "initials" | "names", enabled: r.enabled,
        }))}
        channels={channels.map((c) => ({ channelId: c.channelId, isPrivate: c.isPrivate, allowNames: c.allowNames }))}
        canAllowNames={canAllowNames}
        connected={slackConfigured()}
      />
    </div>
  );
}
