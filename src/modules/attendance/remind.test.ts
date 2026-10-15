import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { viewerFor, withSeed } from "../../../tests/helpers/db";
import type { StaffViewer } from "@/core/auth/viewer";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { fieldContext } from "@/core/query/run";
import { groups } from "../cohorts/schema";
import { groupMembersOn } from "../cohorts/queries";
import type { SlackApi } from "../slack/client";
import { slackRules, slackUserLinks } from "../slack/schema";
import { setSchoolDay } from "./calendar";
import { remindNotTaken } from "./remind";
import { attendanceDaily } from "./schema";

afterAll(async () => {
  await getSql().end();
});

const as = async (tx: Db, email: string) => (await viewerFor(tx, email)) as StaffViewer;

function fakeApi() {
  const posts: { channel: string; text: string }[] = [];
  let n = 0;
  const api: SlackApi = {
    postMessage: async ({ channel, text }) => { posts.push({ channel, text }); return { channel, ts: `1800000000.${String(++n).padStart(6, "0")}` }; },
    openDm: async (user) => `D-${user}`,
    isPrivateChannel: async () => true,
    profile: async () => null,
    unfurl: async () => {},
    workspace: async () => null,
  };
  return { api, posts };
}

describe("attendance-not-taken reminders", () => {
  it("DM the homeroom teacher when their homeroom isn't finished, with counts only", async () => {
    await withSeed(async (tx) => {
      const ops = await as(tx, "yesenia.cruz@creoprep.org");
      const teacher = await as(tx, "jordan.reyes@creoprep.org");
      const { today } = await fieldContext(tx, ops.schoolId);
      const [syracuse] = await tx.select({ id: groups.id }).from(groups).where(and(eq(groups.name, "Syracuse"), eq(groups.type, "homeroom")));
      // Make sure Syracuse isn't finished today, and make today a school day even on a weekend.
      await setSchoolDay(tx, ops, { date: today, isInstructional: true, dayType: "full", note: null });
      const members = await groupMembersOn(tx, syracuse!.id, today);
      await tx.delete(attendanceDaily).where(and(eq(attendanceDaily.date, today), inArray(attendanceDaily.studentId, members)));
      await tx.insert(slackUserLinks).values({ schoolId: ops.schoolId, createdBy: ops.userId, staffId: teacher.staffId, slackUserId: "U-JORDAN" });
      await tx.insert(slackRules).values({ schoolId: ops.schoolId, createdBy: ops.userId, notificationType: "attendance.not_taken", target: "dm_owner", detailLevel: "counts" });

      const { api, posts } = fakeApi();
      const result = await remindNotTaken(tx, ops.schoolId, today, api);
      expect(result.sent).toBeGreaterThanOrEqual(1);
      const toJordan = posts.filter((p) => p.channel === "D-U-JORDAN");
      expect(toJordan.map((p) => p.text)).toEqual([`Syracuse attendance isn't finished: 0 of ${members.length} marked.`]);

      // A day off: nothing is sent.
      await setSchoolDay(tx, ops, { date: today, isInstructional: false, dayType: "other", note: "Closed" });
      expect(await remindNotTaken(tx, ops.schoolId, today, fakeApi().api)).toEqual({ homerooms: 0, sent: 0 });
    });
  });
});
