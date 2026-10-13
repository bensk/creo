import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import { auditLog } from "@/core/audit/schema";
import type { StaffViewer } from "@/core/auth/viewer";
import { getSql } from "@/core/db/client";
import { deleteStudentView, listStudentViews, saveStudentView, updateStudentCell } from "./grid";
import { students } from "./schema";

afterAll(async () => {
  await getSql().end();
});

const TEACHER = "jordan.reyes@creoprep.org";
const OPS = "yesenia.cruz@creoprep.org";
const LEADER = "marisol.pena@creoprep.org";
const staffViewer = async (tx: Parameters<typeof viewerFor>[0], email: string) => (await viewerFor(tx, email)) as StaffViewer;

describe("editing a cell", () => {
  it("lets a homeroom teacher change a student's pronouns, bumps the version, and audits it", async () => {
    await withSeed(async (tx) => {
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const result = await updateStudentCell(tx, await staffViewer(tx, TEACHER), { studentId: cami, version: 1, field: "pronouns", value: "she/they" });
      expect(result).toEqual({ ok: true, data: { version: 2 } });
      const [row] = await tx.select({ pronouns: students.pronouns, version: students.version }).from(students).where(eq(students.id, cami));
      expect(row).toEqual({ pronouns: "she/they", version: 2 });
      const [entry] = await tx.select().from(auditLog).where(eq(auditLog.action, "student.update"));
      expect(entry).toMatchObject({ entityId: cami, before: { pronouns: "she/her" }, after: { pronouns: "she/they" } });
    });
  });

  it("refuses a stale version instead of overwriting someone else's change", async () => {
    await withSeed(async (tx) => {
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const teacher = await staffViewer(tx, TEACHER);
      await updateStudentCell(tx, teacher, { studentId: cami, version: 1, field: "pronouns", value: "she/they" });
      const stale = await updateStudentCell(tx, teacher, { studentId: cami, version: 1, field: "preferredFirstName", value: "Camila" });
      expect(stale).toEqual({ ok: false, error: "Someone else changed this student. Reload to see their change." });
    });
  });

  it("follows permissions: teachers only in their homeroom, alerts only for ops and leaders", async () => {
    await withSeed(async (tx) => {
      const teacher = await staffViewer(tx, TEACHER);
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      expect(await updateStudentCell(tx, teacher, { studentId: mateo, version: 1, field: "pronouns", value: "he/they" })).toEqual({
        ok: false, error: "You can't change that for this student.",
      });
      expect(await updateStudentCell(tx, teacher, { studentId: cami, version: 1, field: "medicalAlert", value: "x" })).toMatchObject({ ok: false });
      expect(await updateStudentCell(tx, await staffViewer(tx, OPS), { studentId: mateo, version: 1, field: "mediaConsent", value: "no" })).toMatchObject({ ok: true });
    });
  });

  it("validates values and clears with empty text", async () => {
    await withSeed(async (tx) => {
      const ops = await staffViewer(tx, OPS);
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      expect(await updateStudentCell(tx, ops, { studentId: cami, version: 1, field: "mediaConsent", value: "maybe" })).toMatchObject({ ok: false });
      expect(await updateStudentCell(tx, ops, { studentId: cami, version: 1, field: "osis" as never, value: "123" })).toMatchObject({ ok: false });
      expect(await updateStudentCell(tx, ops, { studentId: cami, version: 1, field: "medicalAlert", value: "   " })).toMatchObject({ ok: true });
      const [row] = await tx.select({ alert: students.medicalAlert }).from(students).where(eq(students.id, cami));
      expect(row?.alert).toBeNull();
    });
  });
});

describe("saved views", () => {
  it("are private by default, can be shared with the school, and only the owner can change them", async () => {
    await withSeed(async (tx) => {
      const teacher = await staffViewer(tx, TEACHER);
      const leader = await staffViewer(tx, LEADER);
      const spec = { source: "students", filters: [{ field: "grade", op: "eq" as const, value: 7 }], columns: ["name", "homeroom"] };
      const mine = await saveStudentView(tx, teacher, { name: "My 7th graders", spec, sharing: "private" });
      const shared = await saveStudentView(tx, teacher, { name: "Chronic absence", spec, sharing: "school" });
      if (!mine.ok || !shared.ok) throw new Error("save failed");

      expect((await listStudentViews(tx, teacher)).map((v) => v.name)).toEqual(["Chronic absence", "My 7th graders"]);
      expect((await listStudentViews(tx, leader)).map((v) => v.name)).toEqual(["Chronic absence"]);

      expect(await saveStudentView(tx, leader, { id: shared.data.id, name: "Renamed", spec, sharing: "school" })).toMatchObject({ ok: false });
      expect(await deleteStudentView(tx, leader, shared.data.id)).toMatchObject({ ok: false });
      expect(await deleteStudentView(tx, teacher, mine.data.id)).toEqual({ ok: true, data: null });
    });
  });
});
