import { WebClient } from "@slack/web-api";
import { serverEnv } from "@/core/env";

// The few Slack Web API calls the SIS makes, behind an interface so tests can
// use a fake. Only notify.ts, the settings page, and the request handlers use it.

export interface SlackApi {
  postMessage(args: { channel: string; text: string; blocks: unknown[] }): Promise<{ channel: string; ts: string }>;
  openDm(slackUserId: string): Promise<string>;
  /** True for private channels, false for public, null if the bot can't see it. */
  isPrivateChannel(channelId: string): Promise<boolean | null>;
  profile(slackUserId: string): Promise<{ email: string | null; emailConfirmed: boolean; isBot: boolean } | null>;
  unfurl(args: { channel?: string; ts?: string; unfurlId?: string; source?: string; unfurls: Record<string, { blocks: unknown[] }> }): Promise<void>;
  workspace(): Promise<{ team: string; teamId: string } | null>;
}

export function slackConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.SLACK_SIGNING_SECRET && env.SLACK_BOT_TOKEN && env.SLACK_TEAM_ID);
}

let api: SlackApi | undefined;

export function slackApi(): SlackApi {
  if (api) return api;
  const token = serverEnv().SLACK_BOT_TOKEN;
  if (!token) throw new Error("Slack isn't configured");
  const web = new WebClient(token);
  api = {
    async postMessage({ channel, text, blocks }) {
      const res = await web.chat.postMessage({ channel, text, blocks: blocks as never, unfurl_links: false, unfurl_media: false });
      return { channel: res.channel!, ts: res.ts! };
    },
    async openDm(user) {
      const res = await web.conversations.open({ users: user });
      return res.channel!.id!;
    },
    async isPrivateChannel(channel) {
      try {
        const res = await web.conversations.info({ channel });
        return res.channel?.is_private ?? null;
      } catch {
        return null;
      }
    },
    async profile(user) {
      try {
        const res = await web.users.info({ user });
        const u = res.user;
        if (!u) return null;
        return { email: u.profile?.email ?? null, emailConfirmed: u.is_email_confirmed === true, isBot: Boolean(u.is_bot) };
      } catch {
        return null;
      }
    },
    async unfurl({ channel, ts, unfurlId, source, unfurls }) {
      await web.chat.unfurl(
        (unfurlId ? { unfurl_id: unfurlId, source, unfurls } : { channel, ts, unfurls }) as never,
      );
    },
    async workspace() {
      try {
        const res = await web.auth.test();
        return { team: res.team ?? "", teamId: res.team_id ?? "" };
      } catch {
        return null;
      }
    },
  };
  return api;
}
