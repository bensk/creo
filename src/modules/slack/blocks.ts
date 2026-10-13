import type { types } from "@slack/bolt";
import { displayName, type StudentNameParts } from "@/core/ui/StudentName";

type KnownBlock = types.KnownBlock;

// Block Kit builders. They take only the few standard fields they show, so a
// sensitive field can't reach Slack by being passed along: there's nowhere to put it.

/** Escapes text for Slack mrkdwn. */
export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface StudentCard {
  id: string;
  name: StudentNameParts;
  phonetic: string | null;
  grade: number | null;
  homeroom: string | null;
  enrolled: boolean;
}

export function studentCardBlocks(appUrl: string, cards: readonly StudentCard[], more: boolean, query: string): KnownBlock[] {
  if (cards.length === 0) {
    return [{ type: "section", text: { type: "mrkdwn", text: `No students match “${esc(query)}”.` } }];
  }
  const blocks: KnownBlock[] = cards.map((s) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: [
        `*${esc(displayName(s.name))}*${s.phonetic ? `  _${esc(s.phonetic)}_` : ""}`,
        s.enrolled ? [s.grade ? `Grade ${s.grade}` : null, s.homeroom].filter(Boolean).map((x) => esc(String(x))).join(" · ") : "Not enrolled",
      ].join("\n"),
    },
    accessory: { type: "button", text: { type: "plain_text", text: "Open" }, url: `${appUrl}/students/${s.id}`, action_id: `open_student_${s.id}` },
  }));
  if (more) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `More students match. <${appUrl}/students|Search in the SIS>` }],
    });
  }
  return blocks;
}

/** What a channel or DM notification may carry. Nothing else can be passed in. */
export interface NotificationContent {
  /** One plain line, with no student details: "3 students reached 10 absences". */
  headline: string;
  /** Students the notification is about; shown as names or initials only where allowed. */
  students?: readonly StudentNameParts[];
  /** Path in the SIS, e.g. "/students". Every message links to the record. */
  path: string;
}

export type DetailLevel = "counts" | "initials" | "names";

export function initials(s: StudentNameParts): string {
  const first = (s.preferredFirstName || s.legalFirstName).trim();
  const last = (s.preferredLastName || s.legalLastName).trim();
  return `${first.charAt(0)}.${last.charAt(0)}.`.toUpperCase();
}

export function notificationBlocks(appUrl: string, content: NotificationContent, detail: DetailLevel): { text: string; blocks: KnownBlock[] } {
  const students = content.students ?? [];
  const who =
    detail === "counts" || students.length === 0
      ? null
      : (detail === "names" ? students.map((s) => displayName(s)) : students.map(initials)).map(esc).join(", ");
  const link = `${appUrl}${content.path}`;
  const text = `${content.headline}${who ? `: ${who}` : ""}`;
  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `${esc(content.headline)}${who ? `\n${who}` : ""}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `<${link}|Open in the SIS>` }] },
    ],
  };
}
