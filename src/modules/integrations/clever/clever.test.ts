import { and, eq, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../../tests/helpers/db";
import type { StaffViewer } from "@/core/auth/viewer";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { schools } from "@/core/identity/schema";
import { visibleLevels } from "@/core/permissions";
import { groupMemberships, groups, groupStaff, sectionEnrollments, sections, sectionStaff } from "../../cohorts/schema";
import { contacts, studentContacts, studentSupports, students } from "../../students/schema";
import { importBigDataTracker } from "../bdt/import";
import { importClever, type CleverResult } from "./import";
import { homeroomFor, readCleverFiles, type CleverFile } from "./map";

afterAll(async () => {
  await getSql().end();
});

const TODAY = "2026-10-13";
const TEACHER = "jordan.reyes@creoprep.org"; // Syracuse homeroom

// Synthetic Clever files, built like Schoolrunner's export (OSIS 999…, invented names).
const csv = (rows: string[][]) => rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");
const STUDENT_COLS = ["School_id", "Student_id", "Student_number", "State_id", "Last_name", "Middle_name", "First_name", "Grade", "Gender", "Dob", "Race", "Hispanic_Latino", "Ell_status", "Frl_status", "Iep_status", "Student_street", "Student_city", "Student_state", "Student_zip", "Student_email", "Contact_relationship", "Contact_type", "Contact_name", "Contact_phone", "Contact_email", "Username", "Password"];
type StudentRow = Partial<Record<(typeof STUDENT_COLS)[number], string>>;
const studentRow = (r: StudentRow) => STUDENT_COLS.map((c) => r[c] ?? "");

function files(opts: { students: StudentRow[]; sections?: string[][]; enrollments?: string[][]; teachers?: string[][] }): Record<CleverFile, string> {
  return {
    schools: csv([["School_id", "School_name", "School_number", "State_id", "Low_grade", "High_grade", "Principal", "Principal_email", "School_address", "School_city", "School_state", "School_zip", "School_phone"], ["S1", "Creo College Prep", "84X612", "", "5", "8", "", "", "", "", "", "", ""]]),
    students: csv([STUDENT_COLS, ...opts.students.map(studentRow)]),
    teachers: csv([["School_id", "Teacher_id", "Teacher_number", "State_teacher_id", "Last_name", "Middle_name", "First_name", "Teacher_email", "Title", "Username", "Password"], ...(opts.teachers ?? [["S1", "T1", "", "", "Reyes", "", "Jordan", TEACHER, "", "jreyes", "secret"]])]),
    staff: csv([["School_id", "Staff_id", "Staff_email", "First_name", "Last_name", "Department", "Title", "Username", "Password", "Role"]]),
    sections: csv([["School_id", "Section_id", "Teacher_id", "Teacher_2_id", "Teacher_3_id", "Teacher_4_id", "Name", "Section_number", "Grade", "Course_name", "Course_number", "Course_description", "Period", "Subject", "Term_name", "Term_start", "Term_end"], ...(opts.sections ?? [])]),
    enrollments: csv([["School_id", "Section_id", "Student_id"], ...(opts.enrollments ?? [])]),
  };
}

async function schoolId(tx: Db) {
  const [s] = await tx.select({ id: schools.id }).from(schools);
  return s!.id;
}
const run = async (tx: Db, f: Record<CleverFile, string>, dryRun = false) =>
  (await importClever(tx, f, { schoolId: await schoolId(tx), today: TODAY, dryRun })) as CleverResult;

// Looked up once by name, then by ID: the import changes her legal name.
const camiIds = new WeakMap<object, string>();
async function cami(tx: Db) {
  let id = camiIds.get(tx);
  if (!id) {
    id = await studentIdByName(tx, "Camila", "Martinez");
    camiIds.set(tx, id);
  }
  const [s] = await tx.select().from(students).where(eq(students.id, id));
  return s!;
}
async function mateoOsis(tx: Db) {
  const [s] = await tx.select({ id: students.id, osis: students.osis }).from(students).where(eq(students.id, await studentIdByName(tx, "Mateo", "Martinez")));
  return s!;
}

describe("readCleverFiles", () => {
  it("groups contact rows, maps codes, and never keeps passwords or staff emails", () => {
    const data = readCleverFiles(files({
      students: [
        { School_id: "S1", Student_id: "C1", State_id: "999000001", First_name: "Nia", Last_name: "Testcase", Grade: "7", Dob: "05/01/2013", Gender: "F", Race: "B", Hispanic_Latino: "Y", Ell_status: "Y", Iep_status: "N", Student_street: "1 Example Ave", Student_city: "Bronx", Student_state: "NY", Student_zip: "10454", Contact_name: "Dora Testcase", Contact_type: "Guardian", Contact_relationship: "Mother", Contact_phone: "7185550150", Password: "hunter2" },
        { School_id: "S1", Student_id: "C1", State_id: "999000001", First_name: "Nia", Last_name: "Testcase", Grade: "7", Dob: "05/01/2013", Contact_name: "Testcase, Ed", Contact_type: "Emergency", Contact_email: "ed.testcase@creoprep.org" },
        { School_id: "S1", Student_id: "C2", State_id: "12345678901", First_name: "", Last_name: "X", Grade: "4", Dob: "13/45/2013" },
      ],
    }));
    expect(data.students).toHaveLength(1);
    const s = data.students[0]!;
    expect(s).toMatchObject({ osis: "999000001", dateOfBirth: "2013-05-01", gender: "F", ell: true, iep: false, ethnicity: ["Hispanic/Latino", "Black or African American"], homeAddress: "1 Example Ave, Bronx, NY 10454" });
    expect(s.contacts).toEqual([
      { firstName: "Dora", lastName: "Testcase", relationship: "Mother", isGuardian: true, phone: "(718) 555-0150", email: null },
      { firstName: "Ed", lastName: "Testcase", relationship: "Emergency", isGuardian: false, phone: null, email: null },
    ]);
    expect(data.droppedStaffEmails).toBe(1);
    expect(JSON.stringify(data)).not.toContain("hunter2");
    expect(data.problems).toEqual([
      "students.csv line 4, State_id: not a 9-digit OSIS",
      "students.csv line 4, Dob: not a date (MM/DD/YYYY)",
      "students.csv line 4, Grade: not a grade from 5 to 8",
      "students.csv line 4, First_name: empty",
    ]);
  });

  it("refuses a file without the columns it needs", () => {
    const f = files({ students: [] });
    f.enrollments = "School_id,Section_id\n";
    expect(() => readCleverFiles(f)).toThrow(/enrollments.csv is missing columns: Student_id/);
  });

  it("recognizes homeroom sections, not classes named after a homeroom", () => {
    const known = ["Syracuse", "NCA&T"];
    expect(homeroomFor({ name: "Homeroom - Syracuse", course: null }, known)).toBe("Syracuse");
    expect(homeroomFor({ name: "7 NCA&T", course: { name: "Homeroom", number: null, description: null, subject: null } }, known)).toBe("NCA&T");
    expect(homeroomFor({ name: "7 - Syracuse", course: null }, known)).toBe("Syracuse");
    expect(homeroomFor({ name: "Math - Syracuse", course: { name: "Math 7", number: null, description: null, subject: null } }, known)).toBeNull();
    expect(homeroomFor({ name: "8th Grade Homeroom - Spelman", course: null }, known)).toBe("Spelman");
  });
});

describe("importClever", () => {
  it("previews without writing, then applies: Clever wins, contacts aren't duplicated, sections assign teachers", async () => {
    await withSeed(async (tx) => {
      const c = await cami(tx);
      const mateo = await mateoOsis(tx);
      const f = files({
        students: [
          { School_id: "S1", Student_id: "C-CAMI", State_id: c.osis!, First_name: "Camila", Last_name: "Martinez-Ruiz", Grade: "7", Dob: "06/04/2014", Ell_status: "Y", Contact_name: "Rosa Martínez", Contact_type: "Guardian", Contact_relationship: "Mother", Contact_phone: "7185550199" },
          { School_id: "S1", Student_id: "C-MATEO", State_id: mateo.osis!, First_name: "Mateo", Last_name: "Martinez", Grade: "5", Dob: "01/02/2016" },
          { School_id: "S1", Student_id: "C-NEW", State_id: "999777001", First_name: "Nia", Last_name: "Newcomer", Grade: "6", Dob: "03/03/2015" },
        ],
        sections: [["S1", "SEC-MATH", "T1", "", "", "", "Math 7 - Period 2", "M7-2", "7", "Math 7", "M7", "", "2", "Math", "2026-27", "09/08/2026", "06/25/2027"]],
        enrollments: [["S1", "SEC-MATH", "C-CAMI"], ["S1", "SEC-MATH", "C-MATEO"]],
      });

      const preview = await run(tx, f, true);
      expect(preview.counts).toMatchObject({ students: 3, studentsCreated: 1, sectionsCreated: 1, sectionStudentsAdded: 2 });
      expect((await cami(tx)).legalLastName).toBe("Martinez");
      expect(await tx.select().from(sections)).toHaveLength(0);

      const applied = await run(tx, f);
      expect(applied.runId).toBeTruthy();
      expect(applied.counts).toMatchObject({ studentsCreated: 1, sectionsCreated: 1, sectionStudentsAdded: 2, sectionTeacherChanges: 1 });
      expect((await cami(tx)).legalLastName).toBe("Martinez-Ruiz");
      expect((await cami(tx)).preferredFirstName).toBe("Cami"); // the SIS's own field is untouched

      // The existing mother was matched by name, not created again; her phone updated.
      const moms = await tx.select({ id: contacts.id, phone: contacts.phonePrimary }).from(studentContacts)
        .innerJoin(contacts, eq(contacts.id, studentContacts.contactId))
        .where(and(eq(studentContacts.studentId, c.id), isNull(studentContacts.endsOn), eq(contacts.firstName, "Rosa")));
      expect(moms).toEqual([{ id: expect.any(String), phone: "(718) 555-0199" }]);

      const ell = await tx.select().from(studentSupports).where(and(eq(studentSupports.studentId, c.id), eq(studentSupports.type, "ell"), isNull(studentSupports.endsOn)));
      expect(ell).toHaveLength(1);

      // Mateo isn't in the Syracuse teacher's homeroom, but is in their section now.
      const teacher = (await viewerFor(tx, TEACHER)) as StaffViewer;
      expect((await visibleLevels(tx, teacher, mateo.id)).has("sensitive")).toBe(true);
      const [section] = await tx.select().from(sections);
      expect(await tx.select({ role: sectionStaff.role }).from(sectionStaff).where(eq(sectionStaff.sectionId, section!.id))).toEqual([{ role: "primary" }]);

      // Running the same files again changes nothing.
      const again = await run(tx, f);
      expect(again.counts).toMatchObject({ studentsCreated: 0, studentsUpdated: 0, contactChanges: 0, supportChanges: 0, sectionsCreated: 0, sectionsUpdated: 0, sectionStudentsAdded: 0, sectionStudentsEnded: 0, sectionTeacherChanges: 0 });

      // A later file without Mateo in the section, and then without the section at all.
      const later = await run(tx, { ...f, enrollments: csv([["School_id", "Section_id", "Student_id"], ["S1", "SEC-MATH", "C-CAMI"]]) });
      expect(later.counts.sectionStudentsEnded).toBe(1);
      expect((await visibleLevels(tx, teacher, mateo.id)).has("sensitive")).toBe(false);
      const gone = await run(tx, { ...f, sections: csv([["School_id", "Section_id", "Teacher_id", "Name"]]), enrollments: csv([["School_id", "Section_id", "Student_id"]]) });
      expect(gone.counts.sectionsArchived).toBe(1);
      expect(await tx.select().from(sectionEnrollments).where(and(eq(sectionEnrollments.sectionId, section!.id), isNull(sectionEnrollments.endsOn)))).toHaveLength(0);
    });
  });

  it("sets homerooms and homeroom teachers from homeroom sections", async () => {
    await withSeed(async (tx) => {
      const c = await cami(tx);
      const f = files({
        students: [{ School_id: "S1", Student_id: "C-CAMI", State_id: c.osis!, First_name: "Camila", Last_name: "Martinez", Grade: "7", Dob: "06/04/2014" }],
        sections: [["S1", "SEC-HR", "T1", "", "", "", "Homeroom - Spelman", "", "7", "Homeroom", "HR7", "", "", "", "", "", ""]],
        enrollments: [["S1", "SEC-HR", "C-CAMI"]],
      });
      const result = await run(tx, f);
      expect(result.homerooms).toEqual([{ section: "Homeroom - Spelman", homeroom: "Spelman" }]);
      const current = await tx.select({ name: groups.name }).from(groupMemberships).innerJoin(groups, eq(groups.id, groupMemberships.groupId))
        .where(and(eq(groupMemberships.studentId, c.id), eq(groups.type, "homeroom"), isNull(groupMemberships.endsOn)));
      expect(current).toEqual([{ name: "Spelman" }]);
      const staffed = await tx.select({ fn: groupStaff.function }).from(groupStaff).innerJoin(groups, eq(groups.id, groupStaff.groupId))
        .where(and(eq(groups.name, "Spelman"), isNull(groupStaff.endsOn)));
      expect(staffed).toEqual([{ fn: "homeroom_teacher" }]);
    });
  });

  it("never changes who may pick a student up", async () => {
    await withSeed(async (tx) => {
      const c = await cami(tx);
      const [link] = await tx.select({ id: studentContacts.id, contactId: studentContacts.contactId }).from(studentContacts)
        .innerJoin(contacts, eq(contacts.id, studentContacts.contactId))
        .where(and(eq(studentContacts.studentId, c.id), isNull(studentContacts.endsOn), eq(contacts.firstName, "Rosa")));
      await tx.update(studentContacts).set({ pickupAllowed: false }).where(eq(studentContacts.id, link!.id));
      await run(tx, files({ students: [{ School_id: "S1", Student_id: "C-CAMI", State_id: c.osis!, First_name: "Camila", Last_name: "Martinez", Grade: "7", Dob: "06/04/2014", Contact_name: "Rosa Martínez", Contact_type: "Guardian", Contact_relationship: "Mother" }] }));
      const [after] = await tx.select({ pickupAllowed: studentContacts.pickupAllowed }).from(studentContacts).where(eq(studentContacts.id, link!.id));
      expect(after?.pickupAllowed).toBe(false);
    });
  });

  it("refuses real OSIS numbers in a synthetic database", async () => {
    await withSeed(async (tx) => {
      const f = files({ students: [{ School_id: "S1", Student_id: "C1", State_id: "212345678", First_name: "A", Last_name: "B", Grade: "6", Dob: "01/01/2015" }] });
      expect(await importClever(tx, f, { schoolId: await schoolId(tx), today: TODAY, dryRun: true })).toEqual({ refused: expect.stringMatching(/synthetic data only/) });
    });
  });

  it("leaves Clever's fields alone when the Big Data Tracker runs afterwards", async () => {
    await withSeed(async (tx) => {
      const c = await cami(tx);
      await run(tx, files({ students: [{ School_id: "S1", Student_id: "C-CAMI", State_id: c.osis!, First_name: "Camila", Last_name: "Martinez-Ruiz", Grade: "7", Dob: "06/04/2014" }] }));
      await importBigDataTracker(tx, { listPages: async () => [{
        id: "page-cami", properties: { First: "Camila", Last: "Martinez", Grade: "7", OSIS: Number(c.osis), DOB: { start: "2014-06-04", end: null }, "Social Media": "No" },
      }] }, { schoolId: await schoolId(tx), today: TODAY });
      const after = await cami(tx);
      expect(after.legalLastName).toBe("Martinez-Ruiz");
      expect(after.mediaConsent).toBe("no");
    });
  });
});
