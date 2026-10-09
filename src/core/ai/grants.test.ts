import { afterAll, describe, expect, it } from "vitest";
import { userIdByEmail, viewerFor, withSeed } from "../../../tests/helpers/db";
import { getSql } from "../db/client";
import type { Db } from "../db/types";
import { schools } from "../identity/schema";
import { aiGrants } from "./schema";
import { isEnabledFor } from "./grants";

afterAll(async () => {
  await getSql().end();
});

const LEADER = "marisol.pena@creoprep.org";
const TEACHER = "jordan.reyes@creoprep.org";
const ON = { switchedOn: true, configured: true };

async function grant(tx: Db, values: { role?: string; userEmail?: string; effect?: "grant" | "revoke"; features?: string[] | null; ended?: boolean }) {
  const [school] = await tx.select({ id: schools.id }).from(schools);
  const by = await userIdByEmail(tx, "dana.whitfield@creoprep.org");
  await tx.insert(aiGrants).values({
    schoolId: school!.id, createdBy: by, role: values.role ?? null,
    userId: values.userEmail ? await userIdByEmail(tx, values.userEmail) : null,
    effect: values.effect ?? "grant", features: values.features ?? null,
    endedAt: values.ended ? new Date() : null, endedBy: values.ended ? by : null,
  });
}

describe("isEnabledFor", () => {
  it("is off for everyone with no grants", async () => {
    await withSeed(async (tx) => {
      expect(await isEnabledFor(tx, await viewerFor(tx, LEADER), "dashboards.widget", ON)).toBe(false);
    });
  });

  it("follows a role grant, scoped to features", async () => {
    await withSeed(async (tx) => {
      await grant(tx, { role: "leader", features: ["dashboards.widget"] });
      const leader = await viewerFor(tx, LEADER);
      expect(await isEnabledFor(tx, leader, "dashboards.widget", ON)).toBe(true);
      expect(await isEnabledFor(tx, leader, "family.draft", ON)).toBe(false);
      expect(await isEnabledFor(tx, await viewerFor(tx, TEACHER), "dashboards.widget", ON)).toBe(false);
    });
  });

  it("lets a personal revoke override a role grant, and a personal grant add to nothing", async () => {
    await withSeed(async (tx) => {
      await grant(tx, { role: "leader" });
      await grant(tx, { userEmail: LEADER, effect: "revoke", features: ["family.draft"] });
      await grant(tx, { userEmail: TEACHER, features: ["trackers.suggest"] });
      const leader = await viewerFor(tx, LEADER);
      expect(await isEnabledFor(tx, leader, "family.draft", ON)).toBe(false);
      expect(await isEnabledFor(tx, leader, "dashboards.widget", ON)).toBe(true);
      expect(await isEnabledFor(tx, await viewerFor(tx, TEACHER), "trackers.suggest", ON)).toBe(true);
    });
  });

  it("lets a role revoke beat a role grant from another of the person's roles", async () => {
    await withSeed(async (tx) => {
      await grant(tx, { role: "teacher" });
      await grant(tx, { role: "support", effect: "revoke" });
      expect(await isEnabledFor(tx, await viewerFor(tx, "luis.almonte@creoprep.org"), "students.summary", ON)).toBe(false);
    });
  });

  it("ignores ended grants", async () => {
    await withSeed(async (tx) => {
      await grant(tx, { role: "leader", ended: true });
      expect(await isEnabledFor(tx, await viewerFor(tx, LEADER), "dashboards.widget", ON)).toBe(false);
    });
  });

  it("is off for everyone when switched off or unconfigured, whatever the grants", async () => {
    await withSeed(async (tx) => {
      await grant(tx, { role: "leader" });
      const leader = await viewerFor(tx, LEADER);
      expect(await isEnabledFor(tx, leader, "dashboards.widget", { switchedOn: false, configured: true })).toBe(false);
      expect(await isEnabledFor(tx, leader, "dashboards.widget", { switchedOn: true, configured: false })).toBe(false);
    });
  });

  it("is never on for students or families", async () => {
    await withSeed(async (tx) => {
      await grant(tx, { userEmail: "camila.martinez.28@creoprep.org" });
      expect(await isEnabledFor(tx, await viewerFor(tx, "camila.martinez.28@creoprep.org", "student"), "slack.ask", ON)).toBe(false);
    });
  });
});
