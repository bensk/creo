import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, withSeed } from "../../../tests/helpers/db";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { schools, users } from "@/core/identity/schema";
import { fieldContext } from "@/core/query/run";
import { students } from "../students/schema";
import { codeByLetter } from "./codes-standard";
import { attendanceDaily } from "./schema";
import { importSchoolrunnerAttendance, type SrAttendanceResult } from "./schoolrunner";

afterAll(async () => {
  await getSql().end();
});

// Synthetic export: Schoolrunner's columns (contact columns left out), invented students with 999 OSIS.
const HEADER = "Student,Student ID,SR Student Number,SIS Student Number,State ID,Grade Level,Date,Absence Type Code,Absence Type,Comments,Teammate,Homeroom,Incident Id,Absence Active,Contact 1 Name";
const line = (osis: string, date: string, code: string, comment = "") => `"Test, Student",1,${osis},${osis},,7th,${date},${code},x,"${comment}","Reyes, Jordan",7 Room,,1,Someone`;

function weekdayBefore(date: string, back: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function setup(tx: Db) {
  const [school] = await tx.select({ id: schools.id }).from(schools);
  const { today } = await fieldContext(tx, school!.id);
  const date = weekdayBefore(today, 1);
  const osisOf = async (id: string) => (await tx.select({ osis: students.osis }).from(students).where(eq(students.id, id)))[0]!.osis!;
  const cami = await studentIdByName(tx, "Camila", "Martinez");
  const mateo = await studentIdByName(tx, "Mateo", "Martinez");
  // Start the day empty for these two, then Cami gets a mark from SIS staff.
  await tx.delete(attendanceDaily).where(and(eq(attendanceDaily.date, date), inArray(attendanceDaily.studentId, [cami, mateo])));
  const codes = await codeByLetter(tx, school!.id);
  const [system] = await tx.select({ id: users.id }).from(users).where(eq(users.kind, "system")).limit(1);
  await tx.insert(attendanceDaily).values({ schoolId: school!.id, createdBy: system!.id, studentId: cami, date, codeId: codes.get("A")!.id, source: "sis" });
  return { schoolId: school!.id, date, cami, mateo, camiOsis: await osisOf(cami), mateoOsis: await osisOf(mateo) };
}

describe("Schoolrunner daily attendance", () => {
  it("fills days the SIS doesn't have, never overwrites SIS marks, and lists differences", async () => {
    await withSeed(async (tx) => {
      const s = await setup(tx);
      const file = { name: "Daily Attendance Absence Export.csv", text: [HEADER,
        line(s.camiOsis, s.date, "P"), line(s.mateoOsis, s.date, "T", "9:15"),
        line("999999998", s.date, "P"), line(s.mateoOsis, "10/15/2026", "P"),
      ].join("\n") };

      const preview = (await importSchoolrunnerAttendance(tx, [file], { schoolId: s.schoolId, dryRun: true })) as SrAttendanceResult;
      expect(preview.days[0]).toMatchObject({ date: s.date, imported: 1, differences: 1 });
      expect(await tx.select().from(attendanceDaily).where(and(eq(attendanceDaily.date, s.date), eq(attendanceDaily.studentId, s.mateo)))).toHaveLength(0);

      const result = (await importSchoolrunnerAttendance(tx, [file], { schoolId: s.schoolId, dryRun: false })) as SrAttendanceResult;
      expect(result.runId).toBeTruthy();
      expect(result.differences).toEqual([{ studentId: s.cami, date: s.date, schoolrunner: "P", sis: "A" }]);
      expect(result.problems).toEqual([
        "Daily Attendance Absence Export.csv line 5: Date isn't YYYY-MM-DD",
        "Daily Attendance Absence Export.csv line 4: no SIS student with that OSIS",
      ]);
      const [mateoRow] = await tx.select().from(attendanceDaily).where(and(eq(attendanceDaily.date, s.date), eq(attendanceDaily.studentId, s.mateo)));
      expect(mateoRow).toMatchObject({ source: "import" });
      expect(mateoRow!.arrivedAt?.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })).toBe("9:15 AM");
      const [camiRow] = await tx.select().from(attendanceDaily).where(and(eq(attendanceDaily.date, s.date), eq(attendanceDaily.studentId, s.cami)));
      expect(camiRow).toMatchObject({ source: "sis" }); // not overwritten

      // The same file again changes nothing.
      const again = (await importSchoolrunnerAttendance(tx, [file], { schoolId: s.schoolId, dryRun: false })) as SrAttendanceResult;
      expect(again.days[0]).toMatchObject({ imported: 0, updated: 0, agreed: 1, differences: 1 });
    });
  });

  it("knows ET, ISS, and OSS, and refuses real OSIS numbers in a synthetic database", async () => {
    await withSeed(async (tx) => {
      const s = await setup(tx);
      const oss = (await importSchoolrunnerAttendance(tx, [{ name: "a.csv", text: [HEADER, line(s.mateoOsis, s.date, "OSS")].join("\n") }], { schoolId: s.schoolId, dryRun: false })) as SrAttendanceResult;
      expect(oss.days[0]).toMatchObject({ imported: 1 });
      expect(await importSchoolrunnerAttendance(tx, [{ name: "b.csv", text: [HEADER, line("212345678", s.date, "P")].join("\n") }], { schoolId: s.schoolId, dryRun: true }))
        .toEqual({ refused: expect.stringMatching(/synthetic data only/) });
    });
  });
});
