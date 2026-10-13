import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { fakeDirectory } from "../../../tests/helpers/fake-directory";
import { studentIdByName, withSeed } from "../../../tests/helpers/db";
import { enrollments, students } from "../../modules/students/schema";
import { getSql } from "../db/client";
import type { Db } from "../db/types";
import { schools, users } from "../identity/schema";
import { graduationYearOf } from "./directory";
import { linkStudentAccounts } from "./student-accounts";
import { syncUserIdFor } from "./sync";

afterAll(async () => {
  await getSql().end();
});

const TODAY = "2026-10-09"; // school year 2026–27: class of 2027 is 8th grade, 2028 is 7th

async function setup(tx: Db) {
  const [school] = await tx.select({ id: schools.id }).from(schools);
  return { schoolId: school!.id, actorUserId: await syncUserIdFor(tx, school!.id), today: TODAY };
}

/** Two currently enrolled 7th graders with their Google accounts unlinked. */
async function unlinkedSeventhGraders(tx: Db) {
  const rows = await tx
    .select({ id: students.id, first: students.legalFirstName, last: students.legalLastName, osis: students.osis, preferred: students.preferredFirstName })
    .from(students)
    .innerJoin(enrollments, eq(enrollments.studentId, students.id))
    .where(and(eq(enrollments.gradeLevel, 7), eq(enrollments.status, "active")));
  // Pick two whose first+last combination is unique in the grade.
  const key = (r: (typeof rows)[number]) => `${r.first}|${r.last}`;
  const unique = rows.filter((r) => rows.filter((o) => key(o) === key(r)).length === 1 && !r.preferred);
  const picked = unique.slice(0, 2);
  for (const p of picked) await tx.update(students).set({ googleEmail: null }).where(eq(students.id, p.id));
  return picked;
}

describe("graduationYearOf", () => {
  it.each([
    ["/Students/Class of 2028", 2028],
    ["/students/2030", 2030],
    ["/Students", null],
    ["/Staff/2028", null],
  ])("%s → %s", (path, year) => {
    expect(graduationYearOf(path)).toBe(year);
  });
});

describe("linkStudentAccounts", () => {
  it("links by OSIS in the Employee ID, and by name within the graduation-year OU", async () => {
    await withSeed(async (tx) => {
      const [a, b] = await unlinkedSeventhGraders(tx);
      const directory = fakeDirectory([
        { email: "new.a@creoprep.org", givenName: "Someone", familyName: "Else", orgUnitPath: "/Students/Class of 2028", employeeId: a!.osis },
        { email: "new.b@creoprep.org", givenName: b!.first.toUpperCase(), familyName: b!.last, orgUnitPath: "/Students/Class of 2028" },
        // Cami is already linked under her seeded address.
        { email: "camila.martinez.28@creoprep.org", givenName: "Camila", familyName: "Martinez", orgUnitPath: "/Students/Class of 2028" },
        // Staff are ignored.
        { email: "jordan.reyes@creoprep.org", givenName: "Jordan", familyName: "Reyes", orgUnitPath: "/Staff" },
      ]);
      const summary = await linkStudentAccounts(tx, directory, await setup(tx));
      expect(summary).toMatchObject({ accounts: 3, alreadyLinked: 1, linkedByOsis: 1, linkedByName: 1, unmatched: 0 });

      const [linkedA] = await tx.select({ googleEmail: students.googleEmail, userId: students.userId }).from(students).where(eq(students.id, a!.id));
      expect(linkedA?.googleEmail).toBe("new.a@creoprep.org");
      const [identity] = await tx.select({ email: users.email, kind: users.kind }).from(users).where(eq(users.id, linkedA!.userId!));
      expect(identity).toEqual({ email: "new.a@creoprep.org", kind: "student" });
    });
  });

  it("never guesses: wrong grade, unknown names, and duplicate names stay unlinked", async () => {
    await withSeed(async (tx) => {
      const [a, b] = await unlinkedSeventhGraders(tx);
      // Make the two students share a name so a name match is ambiguous.
      await tx.update(students).set({ legalFirstName: "Twin", legalLastName: "Samename" }).where(eq(students.id, a!.id));
      await tx.update(students).set({ legalFirstName: "Twin", legalLastName: "Samename" }).where(eq(students.id, b!.id));
      const directory = fakeDirectory([
        { email: "twin@creoprep.org", givenName: "Twin", familyName: "Samename", orgUnitPath: "/Students/Class of 2028" },
        { email: "nobody@creoprep.org", givenName: "No", familyName: "Match", orgUnitPath: "/Students/Class of 2028" },
        // Right name, wrong grade (class of 2030 is 5th grade).
        { email: "wronggrade@creoprep.org", givenName: "Twin", familyName: "Samename", orgUnitPath: "/Students/Class of 2030" },
        // No graduation year in the OU.
        { email: "noyear@creoprep.org", givenName: "Twin", familyName: "Samename", orgUnitPath: "/Students" },
      ]);
      const summary = await linkStudentAccounts(tx, directory, await setup(tx));
      expect(summary).toMatchObject({ linkedByName: 0, linkedByOsis: 0, ambiguous: 1, unmatched: 3 });
    });
  });

  it("won't move a student who is already linked to a different account", async () => {
    await withSeed(async (tx) => {
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const [row] = await tx.select({ osis: students.osis }).from(students).where(eq(students.id, cami));
      const directory = fakeDirectory([
        { email: "someone.else@creoprep.org", givenName: "X", familyName: "Y", orgUnitPath: "/Students/Class of 2028", employeeId: row!.osis },
      ]);
      const summary = await linkStudentAccounts(tx, directory, await setup(tx));
      expect(summary).toMatchObject({ conflicts: 1, linkedByOsis: 0 });
      const [after] = await tx.select({ googleEmail: students.googleEmail }).from(students).where(eq(students.id, cami));
      expect(after?.googleEmail).toBe("camila.martinez.28@creoprep.org");
    });
  });
});
