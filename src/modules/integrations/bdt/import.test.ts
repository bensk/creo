import { and, eq, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withSeed } from "../../../../tests/helpers/db";
import { auditLog } from "@/core/audit/schema";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { schools } from "@/core/identity/schema";
import { groupMemberships, groups } from "../../cohorts/schema";
import { enrollments, studentContacts, studentSupports, students } from "../../students/schema";
import type { NotionPage } from "../notion/client";
import { importRuns } from "../schema";
import { importBigDataTracker } from "./import";

afterAll(async () => {
  await getSql().end();
});

// Synthetic tracker rows. OSIS 999… like the seed, names invented.
function row(id: string, overrides: NotionPage["properties"] = {}): NotionPage {
  return {
    id,
    properties: {
      First: "Nia", Last: "Testcase", Grade: "7", OSIS: 999900001, Homeroom: "7 - Albany Shaniah & Lily",
      DOB: { start: "2013-05-01", end: null }, "Start Date": { start: "2026-09-08", end: null },
      "Guardian Name": "Dora Testcase", "Guardian Relation": "Mother", "Guardian Phone 1": "(718) 555-0150",
      "Emergency Contact Name": "Ed Testcase", "Emergency Contact Relation": "Uncle", "Emergency Contact Phone": "(347) 555-0151",
      IEP: "Received", "Testing Accommodation(s)": ["Extended Time", "Breaks"],
      ...overrides,
    },
  };
}
const source = (pages: NotionPage[]) => ({ listPages: async () => pages });
const run = async (tx: Db, pages: NotionPage[], today = "2026-10-09") => {
  const [school] = await tx.select({ id: schools.id }).from(schools);
  return importBigDataTracker(tx, source(pages), { schoolId: school!.id, today });
};
async function studentByOsis(tx: Db, osis: string) {
  const [s] = await tx.select().from(students).where(eq(students.osis, osis));
  return s!;
}
async function currentGroups(tx: Db, studentId: string) {
  const rows = await tx
    .select({ name: groups.name, type: groups.type, startsOn: groupMemberships.startsOn, endsOn: groupMemberships.endsOn })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(eq(groupMemberships.studentId, studentId));
  return rows;
}

describe("Big Data Tracker import", () => {
  it("creates a student with enrollment, homeroom, grade team, contacts, and IEP, and records the run", async () => {
    await withSeed(async (tx) => {
      const result = await run(tx, [row("p1")]);
      expect(result.counts).toMatchObject({ rows: 1, invalid: 0, studentsCreated: 1, supportChanges: 1 });

      const nia = await studentByOsis(tx, "999900001");
      expect(nia).toMatchObject({ legalFirstName: "Nia", dateOfBirth: "2013-05-01" });
      const [enrollment] = await tx.select().from(enrollments).where(eq(enrollments.studentId, nia.id));
      expect(enrollment).toMatchObject({ gradeLevel: 7, status: "active", entryDate: "2026-09-08" });
      expect((await currentGroups(tx, nia.id)).map((g) => `${g.type}:${g.name}`).sort()).toEqual(["grade_team:Grade 7 Team", "homeroom:Albany"]);
      const links = await tx.select().from(studentContacts).where(eq(studentContacts.studentId, nia.id));
      expect(links.map((l) => [l.relationship, l.isGuardian, l.portalAccess])).toEqual([["mother", true, false], ["uncle", false, false]]);
      const [iep] = await tx.select().from(studentSupports).where(eq(studentSupports.studentId, nia.id));
      expect(iep).toMatchObject({ type: "iep", source: "import", accommodations: ["Extended Time", "Breaks"] });

      const [record] = await tx.select().from(importRuns).where(eq(importRuns.id, result.runId));
      expect(record).toMatchObject({ status: "succeeded", source: "big_data_tracker" });
      const audits = await tx.select({ via: auditLog.via }).from(auditLog).where(eq(auditLog.entityId, nia.id));
      expect(audits.every((a) => a.via === "import")).toBe(true);
    });
  });

  it("changes nothing when run again", async () => {
    await withSeed(async (tx) => {
      await run(tx, [row("p1")]);
      const second = await run(tx, [row("p1")]);
      expect(second.counts).toMatchObject({
        studentsCreated: 0, studentsUpdated: 0, studentsUnchanged: 1, enrollmentChanges: 0, homeroomChanges: 0,
        contactChanges: 0, supportChanges: 0,
      });
    });
  });

  it("keeps homeroom history when a student moves", async () => {
    await withSeed(async (tx) => {
      await run(tx, [row("p1")], "2026-10-01");
      await run(tx, [row("p1", { Homeroom: "7 - Geneseo Tim & Milo" })], "2026-10-09");
      const nia = await studentByOsis(tx, "999900001");
      const homerooms = (await currentGroups(tx, nia.id)).filter((g) => g.type === "homeroom").sort((a, b) => a.startsOn.localeCompare(b.startsOn));
      expect(homerooms).toEqual([
        { name: "Albany", type: "homeroom", startsOn: "2026-09-08", endsOn: "2026-10-08" },
        { name: "Geneseo", type: "homeroom", startsOn: "2026-10-09", endsOn: null },
      ]);
    });
  });

  it("withdraws, ends memberships, and ends an IEP the tracker no longer lists (manual supports untouched)", async () => {
    await withSeed(async (tx) => {
      await run(tx, [row("p1")], "2026-10-01");
      const nia = await studentByOsis(tx, "999900001");
      await tx.insert(studentSupports).values({ schoolId: nia.schoolId, createdBy: nia.createdBy, studentId: nia.id, type: "ell", startsOn: "2026-09-08" });

      await run(tx, [row("p1", { "ATS Status": "Withdrawn", IEP: "N/A" })], "2026-10-09");
      const [enrollment] = await tx.select().from(enrollments).where(eq(enrollments.studentId, nia.id));
      expect(enrollment).toMatchObject({ status: "withdrawn", exitDate: "2026-10-09" });
      expect((await currentGroups(tx, nia.id)).every((g) => g.endsOn === "2026-10-08")).toBe(true);
      const open = await tx.select({ type: studentSupports.type }).from(studentSupports).where(and(eq(studentSupports.studentId, nia.id), isNull(studentSupports.endsOn)));
      expect(open).toEqual([{ type: "ell" }]);
    });
  });

  it("matches an existing student by OSIS instead of creating a duplicate", async () => {
    await withSeed(async (tx) => {
      const [seeded] = await tx.select().from(students).where(eq(students.legalFirstName, "Camila"));
      const result = await run(tx, [row("p-cami", { First: "Camila", Last: "Martinez", OSIS: Number(seeded!.osis), Homeroom: "7 - Albany Shaniah & Lily" })]);
      expect(result.counts.studentsCreated).toBe(0);
      const [after] = await tx.select().from(students).where(eq(students.id, seeded!.id));
      // The tracker owns legal names and OSIS; the SIS keeps the preferred name.
      expect(after).toMatchObject({ legalFirstName: "Camila", preferredFirstName: "Cami" });
    });
  });

  it("skips bad and duplicate rows, reporting row numbers only", async () => {
    await withSeed(async (tx) => {
      const result = await run(tx, [
        row("p1"),
        row("p2", { First: "Other", OSIS: 999900001 }),
        row("p3", { Grade: "11" }),
        row("p4", { First: "Fine", OSIS: 999900004 }),
      ]);
      expect(result.counts).toMatchObject({ rows: 4, invalid: 3, studentsCreated: 1 });
      expect(result.errors).toEqual([
        "row 1: OSIS is the same as row 2",
        "row 2: OSIS is the same as row 1",
        "row 3: Grade is missing or not 5–8",
      ]);
      expect(result.errors.join(" ")).not.toMatch(/Nia|Other|Testcase|9999/);
    });
  });
});
