import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import { students } from "../../modules/students/schema";
import { auditLog } from "../audit/schema";
import { readAuditLog } from "../audit/read";
import type { StaffViewer } from "../auth/viewer";
import { getSql } from "../db/client";
import { Forbidden } from "../permissions";
import { InvalidInput, runStaffAction, UnauditedWrite } from "./run";

afterAll(async () => {
  await getSql().end();
});

const TEACHER = "jordan.reyes@creoprep.org";
const LEADER = "marisol.pena@creoprep.org";
const OPS = "yesenia.cruz@creoprep.org";

// A realistic action: change a student's pronouns. Homeroom teachers may do it for their homeroom.
const setPronouns = {
  permission: "students.edit_identity",
  input: z.object({ studentId: z.uuid(), pronouns: z.string().min(1).max(40) }),
  target: (input: { studentId: string }) => ({ studentId: input.studentId }),
};

describe("runStaffAction", () => {
  it("runs an allowed write and audits it in the same transaction", async () => {
    await withSeed(async (tx) => {
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const teacher = (await viewerFor(tx, TEACHER)) as StaffViewer;
      await runStaffAction(tx, teacher, setPronouns, async ({ tx: t, input, audit }) => {
        const [before] = await t.select({ pronouns: students.pronouns }).from(students).where(eq(students.id, input.studentId));
        await t.update(students).set({ pronouns: input.pronouns }).where(eq(students.id, input.studentId));
        await audit({ action: "student.set_pronouns", entity: "students", entityId: input.studentId, before, after: { pronouns: input.pronouns } });
      }, { studentId: cami, pronouns: "she/they" });

      const [row] = await tx.select({ pronouns: students.pronouns }).from(students).where(eq(students.id, cami));
      expect(row?.pronouns).toBe("she/they");
      const [entry] = await tx.select().from(auditLog).where(eq(auditLog.action, "student.set_pronouns"));
      expect(entry).toMatchObject({ actorUserId: teacher.userId, entityId: cami, via: "app", after: { pronouns: "she/they" } });
    });
  });

  it("refuses a student outside the teacher's homeroom before running anything", async () => {
    await withSeed(async (tx) => {
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      const teacher = (await viewerFor(tx, TEACHER)) as StaffViewer;
      let ran = false;
      await expect(
        runStaffAction(tx, teacher, setPronouns, async () => { ran = true; }, { studentId: mateo, pronouns: "he/him" }),
      ).rejects.toBeInstanceOf(Forbidden);
      expect(ran).toBe(false);
    });
  });

  it("rejects invalid input before checking anything else", async () => {
    await withSeed(async (tx) => {
      const teacher = (await viewerFor(tx, TEACHER)) as StaffViewer;
      await expect(
        runStaffAction(tx, teacher, setPronouns, async () => {}, { studentId: "not-a-uuid", pronouns: "" }),
      ).rejects.toBeInstanceOf(InvalidInput);
    });
  });

  it("rolls back a write that forgot to audit", async () => {
    await withSeed(async (tx) => {
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const ops = (await viewerFor(tx, OPS)) as StaffViewer;
      await expect(
        runStaffAction(tx, ops, setPronouns, async ({ tx: t, input }) => {
          await t.update(students).set({ pronouns: input.pronouns }).where(eq(students.id, input.studentId));
        }, { studentId: cami, pronouns: "xe/xem" }),
      ).rejects.toBeInstanceOf(UnauditedWrite);
      const [row] = await tx.select({ pronouns: students.pronouns }).from(students).where(eq(students.id, cami));
      expect(row?.pronouns).toBe("she/her");
    });
  });
});

describe("readAuditLog", () => {
  it("is for admin and leaders only", async () => {
    await withSeed(async (tx) => {
      await expect(readAuditLog(tx, await viewerFor(tx, TEACHER))).rejects.toBeInstanceOf(Forbidden);
      await expect(readAuditLog(tx, await viewerFor(tx, OPS))).rejects.toBeInstanceOf(Forbidden);
      const entries = await readAuditLog(tx, await viewerFor(tx, LEADER), { entity: "sessions" });
      expect(entries.length).toBeGreaterThanOrEqual(3); // the three sign-ins above
      expect(entries.every((e) => e.action === "auth.sign_in")).toBe(true);
    });
  });
});
