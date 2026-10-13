import { App, LogLevel, type Logger } from "@slack/bolt";
import { getDb } from "@/core/db/client";
import { serverEnv } from "@/core/env";
import { slackApi, slackConfigured, type SlackApi } from "./client";
import { staffForSlackUser, type SlackIdentity } from "./identity";
import { studentLookup } from "./lookup";
import { NextReceiver } from "./receiver";
import { unfurlFor } from "./unfurl";

// The SIS's Slack app. Every listener first resolves the Slack user to a staff
// member; unlinked people get a short private message and nothing else.

const UNLINKED = "This Slack account isn't linked to the Creo SIS. It links automatically when your Slack email matches your creoprep.org account. Ask an admin if it should.";
const NO_ACCESS = "Your Creo SIS access isn't active. Ask an admin if that's wrong.";

// Bolt's logs can include request payloads; keep only the message names.
const quietLogger: Logger = {
  debug: () => {}, info: () => {}, warn: () => {},
  error: (...msgs: unknown[]) => console.error("slack:", msgs.map((m) => (m instanceof Error ? m.name : typeof m)).join(" ")),
  setLevel: () => {}, getLevel: () => LogLevel.ERROR, setName: () => {},
};

export function identify(slackUserId: string, api: SlackApi = slackApi()): Promise<SlackIdentity> {
  return staffForSlackUser(getDb(), slackUserId, () => api.profile(slackUserId));
}

let receiver: NextReceiver | undefined;

/** The receiver for the Slack route handlers, or null when Slack isn't configured. */
export function slackReceiver(): NextReceiver | null {
  if (!slackConfigured()) return null;
  if (receiver) return receiver;
  const env = serverEnv();
  receiver = new NextReceiver({ signingSecret: env.SLACK_SIGNING_SECRET!, teamId: env.SLACK_TEAM_ID! });
  const app = new App({ token: env.SLACK_BOT_TOKEN, receiver, tokenVerificationEnabled: false, logger: quietLogger, logLevel: LogLevel.ERROR });
  const appUrl = env.APP_URL ?? "";

  app.command("/student", async ({ command, ack }) => {
    const who = await identify(command.user_id);
    if (who.status !== "linked") return ack({ response_type: "ephemeral", text: who.status === "no_access" ? NO_ACCESS : UNLINKED });
    const result = await studentLookup(getDb(), who.viewer, command.text, appUrl);
    await ack({ response_type: "ephemeral", text: result.text, ...(result.blocks ? { blocks: result.blocks } : {}) });
  });

  // Buttons that only open a link still send an action; acknowledge them.
  app.action(/^open_student_/, async ({ ack }) => ack());

  app.event("link_shared", async ({ event }) => {
    const who = await identify(event.user);
    if (who.status !== "linked") return;
    const unfurls: Record<string, { blocks: unknown[] }> = {};
    for (const link of event.links) {
      const preview = await unfurlFor(getDb(), who.viewer.schoolId, link.url, appUrl);
      if (!preview) continue;
      unfurls[link.url] = {
        blocks: [{ type: "context", elements: [{ type: "mrkdwn", text: `*${preview.title}*${preview.detail ? ` · ${preview.detail}` : ""} · Creo SIS` }] }],
      };
    }
    if (Object.keys(unfurls).length === 0) return;
    const e = event as typeof event & { unfurl_id?: string; source?: string };
    await slackApi().unfurl({ channel: event.channel, ts: event.message_ts, unfurlId: e.unfurl_id, source: e.source, unfurls });
  });

  return receiver;
}
