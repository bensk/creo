import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import { auditLog } from "@/core/audit/schema";
import { staff } from "@/core/auth/schema";
import type { StaffViewer } from "@/core/auth/viewer";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { notificationBlocks } from "./blocks";
import type { SlackApi } from "./client";
import { staffForSlackUser } from "./identity";
import { studentLookup } from "./lookup";
import { deliver } from "./notify";
import { NextReceiver } from "./receiver";
import { approveChannel, saveRule } from "./rules";
import { slackChannelAllowlist, slackMessages, slackRules } from "./schema";
import { unfurlFor } from "./unfurl";

afterAll(async () => {
  await getSql().end();
});

const SECRET = "test-signing-secret";
const TEAM = "T0CREO";
const APP = "https://sis.creoprep.org";
const ADMIN = "dana.whitfield@creoprep.org";
const LEADER = "marisol.pena@creoprep.org";
const TEACHER = "jordan.reyes@creoprep.org";
const as = async (tx: Db, email: string) => (await viewerFor(tx, email)) as StaffViewer;

function signed(body: string, contentType = "application/x-www-form-urlencoded", { secret = SECRET, age = 0 } = {}) {
  const ts = Math.floor(Date.now() / 1000) - age;
  const sig = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
  return new Request("http://localhost/api/slack/commands", {
    method: "POST", body, headers: { "content-type": contentType, "x-slack-signature": sig, "x-slack-request-timestamp": String(ts) },
  });
}

let messageCount = 0;
function fakeApi(overrides: Partial<SlackApi> = {}): SlackApi & { posts: { channel: string; text: string }[] } {
  const posts: { channel: string; text: string }[] = [];
  return {
    posts,
    postMessage: async ({ channel, text }) => {
      posts.push({ channel, text });
      return { channel, ts: `1700000000.${String(++messageCount).padStart(6, "0")}` };
    },
    openDm: async (user) => `D${user}`,
    isPrivateChannel: async () => true,
    profile: async () => null,
    unfurl: async () => {},
    workspace: async () => ({ team: "Creo", teamId: TEAM }),
    ...overrides,
  };
}

describe("receiver", () => {
  const receiver = () => {
    const r = new NextReceiver({ signingSecret: SECRET, teamId: TEAM });
    const processEvent = vi.fn(async (event: { body: Record<string, unknown>; ack: (r?: unknown) => Promise<void> }) => {
      await event.ack({ response_type: "ephemeral", text: `got ${String(event.body.command)}` });
    });
    r.init({ processEvent } as never);
    return { r, processEvent };
  };

  it("refuses a bad or stale signature", async () => {
    const { r, processEvent } = receiver();
    expect((await r.handle(signed("command=/student&team_id=T0CREO", undefined, { secret: "wrong" }))).status).toBe(401);
    expect((await r.handle(signed("command=/student&team_id=T0CREO", undefined, { age: 60 * 10 }))).status).toBe(401);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("refuses other workspaces and answers URL verification", async () => {
    const { r, processEvent } = receiver();
    expect((await r.handle(signed("command=/student&team_id=TOTHER"))).status).toBe(403);
    const challenge = await r.handle(signed(JSON.stringify({ type: "url_verification", challenge: "abc" }), "application/json"));
    expect(await challenge.json()).toEqual({ challenge: "abc" });
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("passes a verified request to Bolt and returns its ack", async () => {
    const { r } = receiver();
    const res = await r.handle(signed("command=%2Fstudent&text=cami&team_id=T0CREO&user_id=U1"));
    expect(await res.json()).toEqual({ response_type: "ephemeral", text: "got /student" });
  });
});

describe("identity", () => {
  it("links by confirmed Workspace email only, then reuses the link", async () => {
    await withSeed(async (tx) => {
      const unconfirmed = await staffForSlackUser(tx, "U100", async () => ({ email: TEACHER, emailConfirmed: false, isBot: false }));
      expect(unconfirmed.status).toBe("unlinked");
      const stranger = await staffForSlackUser(tx, "U101", async () => ({ email: "someone@gmail.com", emailConfirmed: true, isBot: false }));
      expect(stranger.status).toBe("unlinked");

      const linked = await staffForSlackUser(tx, "U102", async () => ({ email: TEACHER, emailConfirmed: true, isBot: false }));
      expect(linked).toMatchObject({ status: "linked", viewer: { kind: "staff", roles: ["teacher"] } });
      const again = await staffForSlackUser(tx, "U102", async () => { throw new Error("should not look up again"); });
      expect(again.status).toBe("linked");
      const [entry] = await tx.select().from(auditLog).where(eq(auditLog.action, "slack.link_user"));
      expect(entry?.via).toBe("slack");

      // A deactivated staff member keeps the link but loses access.
      await tx.update(staff).set({ status: "inactive" }).where(eq(staff.email, TEACHER));
      expect((await staffForSlackUser(tx, "U102", async () => null)).status).toBe("no_access");
    });
  });
});

describe("/student lookup", () => {
  it("shows standard fields only, links to the SIS, and is audited via slack", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const result = await studentLookup(tx, teacher, "Camila Martinez", APP);
      const json = JSON.stringify(result.blocks);
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      expect(json).toContain("Cami Martinez");
      expect(json).toContain(`${APP}/students/${cami}`);
      expect(json).not.toMatch(/999\d{6}/); // no OSIS
      expect(json).not.toMatch(/IEP|504|allerg/i);
      const [entry] = await tx.select().from(auditLog).where(and(eq(auditLog.action, "slack.student_lookup"), eq(auditLog.actorUserId, teacher.userId)));
      expect(entry?.via).toBe("slack");
    });
  });

  it("explains an empty query", async () => {
    await withSeed(async (tx) => {
      expect((await studentLookup(tx, await as(tx, TEACHER), "  ", APP)).text).toMatch(/Type a name/);
    });
  });
});

describe("unfurls", () => {
  it("show the page type and title, never a student's name", async () => {
    await withSeed(async (tx) => {
      const leader = await as(tx, LEADER);
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      expect(await unfurlFor(tx, leader.schoolId, `${APP}/students/${cami}`, APP)).toEqual({ title: "Student profile" });
      expect(await unfurlFor(tx, leader.schoolId, `${APP}/students`, APP)).toMatchObject({ title: "Students", detail: expect.stringMatching(/^\d+ enrolled students$/) });
      expect(await unfurlFor(tx, leader.schoolId, `https://evil.example.com/students`, APP)).toBeNull();
      expect(await unfurlFor(tx, leader.schoolId, `${APP}/students/${cami}/anything`, APP)).toBeNull();
    });
  });
});

describe("notifications", () => {
  const students = [{ legalFirstName: "Camila", legalLastName: "Martinez", preferredFirstName: "Cami" }];

  it("counts by default; initials and names only as allowed", () => {
    expect(notificationBlocks(APP, { headline: "2 students", students, path: "/students" }, "counts").text).toBe("2 students");
    expect(notificationBlocks(APP, { headline: "2 students", students, path: "/students" }, "initials").text).toBe("2 students: C.M.");
    expect(notificationBlocks(APP, { headline: "2 students", students, path: "/students" }, "names").text).toBe("2 students: Cami Martinez");
  });

  it("drops names to initials unless the channel is approved and still private, and logs every message", async () => {
    await withSeed(async (tx) => {
      const admin = await as(tx, ADMIN);
      const by = { schoolId: admin.schoolId, createdBy: admin.userId };
      const [rule] = await tx.insert(slackRules).values({ ...by, notificationType: "slack.test", target: "channel", channelId: "G0NAMES1", detailLevel: "names" }).returning();
      const content = { headline: "1 student", students, path: "/students" };

      let api = fakeApi();
      expect((await deliver(tx, api, admin.schoolId, rule!, content))[0]?.detail).toBe("initials");
      expect(api.posts[0]?.text).not.toContain("Cami");

      await tx.insert(slackChannelAllowlist).values({ ...by, channelId: "G0NAMES1", isPrivate: true, allowNames: true, approvedBy: admin.userId });
      api = fakeApi();
      expect((await deliver(tx, api, admin.schoolId, rule!, content))[0]?.detail).toBe("names");
      expect(api.posts[0]?.text).toContain("Cami Martinez");

      api = fakeApi({ isPrivateChannel: async () => false }); // made public since approval
      expect((await deliver(tx, api, admin.schoolId, rule!, content))[0]?.detail).toBe("initials");

      const logged = await tx.select().from(slackMessages).where(eq(slackMessages.channelId, "G0NAMES1"));
      expect(logged.map((m) => m.detailLevel).sort()).toEqual(["initials", "initials", "names"]);
    });
  });
});

describe("rules", () => {
  it("are for admins and leaders; names need an admin-approved private channel", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const leader = await as(tx, LEADER);
      const admin = await as(tx, ADMIN);
      const rule = { notificationType: "slack.test", target: "channel" as const, channelId: "G0NAMES2", dmRole: null, detailLevel: "names" as const, enabled: true };

      expect(await saveRule(tx, teacher, { ...rule, detailLevel: "counts" })).toMatchObject({ ok: false });
      expect(await saveRule(tx, leader, rule)).toMatchObject({ ok: false, error: expect.stringMatching(/approved for names/) });
      expect(await saveRule(tx, leader, { ...rule, detailLevel: "counts" })).toMatchObject({ ok: true });

      const api = fakeApi();
      expect(await approveChannel(tx, api, leader, { channelId: "G0NAMES2", allowNames: true })).toMatchObject({ ok: false, error: expect.stringMatching(/Only admins/) });
      expect(await approveChannel(tx, fakeApi({ isPrivateChannel: async () => false }), admin, { channelId: "C0PUBLIC1", allowNames: true }))
        .toMatchObject({ ok: false, error: expect.stringMatching(/private/) });
      expect(await approveChannel(tx, api, admin, { channelId: "G0NAMES2", allowNames: true })).toMatchObject({ ok: true });
      expect(await saveRule(tx, leader, rule)).toMatchObject({ ok: true });
    });
  });
});
