import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import { auditLog } from "@/core/audit/schema";
import type { StaffViewer } from "@/core/auth/viewer";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { fieldContext } from "@/core/query/run";
import { groups } from "../cohorts/schema";
import { activeCodes, attendanceProgress, homeroomDay, homeroomsFor, markAttendance } from "./take";

afterAll(async () => {
  await getSql().end();
});

const TEACHER = "jordan.reyes@creoprep.org"; // Syracuse
const OPS = "yesenia.cruz@creoprep.org";
const as = async (tx: Db, email: string) => (await viewerFor(tx, email)) as StaffViewer;
const homeroom = async (tx: Db, name: string) => (await tx.select({ id: groups.id }).from(groups).where(and(eq(groups.name, name), eq(groups.type, "homeroom"))))[0]!.id;

/** The most recent weekday on or before a date. */
function weekdayOnOrBefore(date: string, back = 0): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

describe("taking attendance", () => {
  it("a homeroom teacher marks their own homeroom today, and changes are audited", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const { today } = await fieldContext(tx, teacher.schoolId);
      if ([0, 6].includes(new Date(`${today}T12:00:00Z`).getUTCDay())) return; // nothing to take on a weekend
      const codes = new Map((await activeCodes(tx, teacher.schoolId)).map((c) => [c.code, c.id]));
      const syracuse = await homeroom(tx, "Syracuse");
      expect((await homeroomsFor(tx, teacher)).homerooms.map((h) => h.name)).toEqual(["Syracuse"]);
      const cami = await studentIdByName(tx, "Camila", "Martinez");

      expect(await markAttendance(tx, teacher, { groupId: syracuse, date: today, marks: [{ studentId: cami, codeId: codes.get("A")! }] })).toEqual({ ok: true, data: { saved: 1 } });
      expect(await markAttendance(tx, teacher, { groupId: syracuse, date: today, marks: [{ studentId: cami, codeId: codes.get("P")! }] })).toEqual({ ok: true, data: { saved: 1 } });
      expect(await markAttendance(tx, teacher, { groupId: syracuse, date: today, marks: [{ studentId: cami, codeId: codes.get("P")! }] })).toEqual({ ok: true, data: { saved: 0 } });
      expect((await homeroomDay(tx, teacher.schoolId, syracuse, today)).marks.get(cami)?.codeId).toBe(codes.get("P"));
      const changes = await tx.select().from(auditLog).where(and(eq(auditLog.actorUserId, teacher.userId), eq(auditLog.action, "attendance.change")));
      expect(changes.at(-1)?.before).toEqual({ code: "A" });

      // Not their homeroom, a student from elsewhere, or another day.
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      expect(await markAttendance(tx, teacher, { groupId: syracuse, date: today, marks: [{ studentId: mateo, codeId: codes.get("P")! }] })).toEqual({ ok: false, error: "You take attendance for your own homeroom only." });
      expect(await markAttendance(tx, teacher, { groupId: await homeroom(tx, "NCA&T"), date: today, marks: [{ studentId: cami, codeId: codes.get("P")! }] }))
        .toMatchObject({ ok: false, error: /your own homeroom/ });
      expect(await markAttendance(tx, teacher, { groupId: syracuse, date: weekdayOnOrBefore(today, 1), marks: [{ studentId: cami, codeId: codes.get("P")! }] }))
        .toMatchObject({ ok: false, error: /today/ });
    });
  });

  it("ops correct any homeroom on an earlier day, but not future days or weekends", async () => {
    await withSeed(async (tx) => {
      const ops = await as(tx, OPS);
      const { today } = await fieldContext(tx, ops.schoolId);
      const codes = new Map((await activeCodes(tx, ops.schoolId)).map((c) => [c.code, c.id]));
      const syracuse = await homeroom(tx, "Syracuse");
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const earlier = weekdayOnOrBefore(today, 3);
      expect((await markAttendance(tx, ops, { groupId: syracuse, date: earlier, marks: [{ studentId: cami, codeId: codes.get("E")! }] })).ok).toBe(true);
      const future = new Date(`${today}T12:00:00Z`);
      future.setUTCDate(future.getUTCDate() + 7);
      expect(await markAttendance(tx, ops, { groupId: syracuse, date: future.toISOString().slice(0, 10), marks: [{ studentId: cami, codeId: codes.get("P")! }] }))
        .toMatchObject({ ok: false, error: /hasn't happened/ });
      const saturday = new Date(`${earlier}T12:00:00Z`);
      while (saturday.getUTCDay() !== 6) saturday.setUTCDate(saturday.getUTCDate() - 1);
      expect(await markAttendance(tx, ops, { groupId: syracuse, date: saturday.toISOString().slice(0, 10), marks: [{ studentId: cami, codeId: codes.get("P")! }] }))
        .toMatchObject({ ok: false, error: /weekend/ });
      expect((await homeroomsFor(tx, ops)).homerooms.length).toBeGreaterThan(10);
      const progress = await attendanceProgress(tx, ops.schoolId, earlier);
      expect(progress.find((p) => p.id === syracuse)?.students).toBeGreaterThan(0);
    });
  });
});
