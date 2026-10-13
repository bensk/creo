import { and, eq, gte, isNull, lte, notInArray, sql } from "drizzle-orm";
import { staff } from "@/core/auth/schema";
import type { Db } from "@/core/db/types";
import { isDatabaseSynthetic } from "@/core/db/synthetic";
import { users } from "@/core/identity/schema";
import { importContext, type ImportContext } from "@/core/imports/context";
import { schoolYears } from "@/core/school/schema";
import {
  archiveSection, ensureGroup, homeroomNames, setCurrentGroup, syncGroupStaff, syncSectionEnrollments, syncSectionStaff,
  upsertCourse, upsertSection,
} from "../../cohorts/imports";
import {
  endContactLink, findCurrentContactByName, findStudentByOsis, syncImportedEnrollment, syncImportedSupports,
  upsertImportedContact, upsertImportedDemographics, upsertImportedStudent,
} from "../../students/imports";
import { enrollments } from "../../students/schema";
import { findByExternalId, rememberExternalId } from "../external-ids";
import { externalIds, importRuns } from "../schema";
import { homeroomFor, readCleverFiles, type CleverData, type CleverFile, type CleverStudent } from "./map";

// Clever roster files → students, contacts, supports (IEP, ELL), demographics,
// courses, sections, section teachers and students, and homerooms. Clever
// wins over the Big Data Tracker for the fields it carries. Each file is a
// full snapshot: sections, teachers, and students missing from it end today.
// Students missing from students.csv are reported, never withdrawn.

export interface CleverCounts {
  students: number;
  studentsCreated: number;
  studentsUpdated: number;
  enrollmentChanges: number;
  contactChanges: number;
  supportChanges: number;
  demographicsChanges: number;
  sections: number;
  sectionsCreated: number;
  sectionsUpdated: number;
  sectionsArchived: number;
  sectionTeacherChanges: number;
  sectionStudentsAdded: number;
  sectionStudentsEnded: number;
  homeroomChanges: number;
  homeroomTeacherChanges: number;
  problems: number;
  droppedStaffEmails: number;
}

export interface CleverResult {
  counts: CleverCounts;
  /** By file, line, and column. Never names a student. */
  problems: string[];
  /** Section names the import treated as homerooms, with the homeroom each became. */
  homerooms: { section: string; homeroom: string }[];
  unmatchedTeachers: string[];
  /** SIS students currently enrolled but not in students.csv. */
  missingFromClever: number;
  runId: string | null;
}

const ACTOR_NAME = "Clever import";

async function importActor(db: Db, schoolId: string): Promise<string> {
  const [existing] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.schoolId, schoolId), eq(users.kind, "system"), eq(users.displayName, ACTOR_NAME)));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, schoolId, createdBy: id, kind: "system", displayName: ACTOR_NAME });
  return id;
}

/**
 * Real data only lands in a real database, and a synthetic one only takes
 * synthetic files (every OSIS starts with 999). Returns a reason to refuse, or null.
 */
export async function refuseCleverData(db: Db, data: CleverData): Promise<string | null> {
  const [row] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  const name = row?.name ?? "";
  const synthetic = (await isDatabaseSynthetic(db)) || name === "creo_dev" || /_(dev|test|staging)$/.test(name);
  if (synthetic && data.students.some((s) => !s.osis.startsWith("999"))) {
    return "This database holds synthetic data only, and these files contain real OSIS numbers. Upload them in production.";
  }
  return null;
}

class DryRun extends Error {}

async function applyStudent(ctx: ImportContext, year: { id: string; startsOn: string }, s: CleverStudent, counts: CleverCounts) {
  const existing = (await findByExternalId(ctx, "clever", "students", s.cleverId)) ?? (await findStudentByOsis(ctx, s.osis));
  const student = await upsertImportedStudent(ctx, existing, {
    legalFirstName: s.legalFirstName, legalLastName: s.legalLastName, osis: s.osis, dateOfBirth: s.dateOfBirth,
  });
  await rememberExternalId(ctx, "clever", "students", s.cleverId, student.id);
  if (student.change === "created") counts.studentsCreated++;
  if (student.change === "updated") counts.studentsUpdated++;

  const entryDate = ctx.today < year.startsOn ? ctx.today : year.startsOn;
  if ((await syncImportedEnrollment(ctx, student.id, { schoolYearId: year.id, grade: s.grade, entryDate, withdrawn: false })) !== "unchanged") {
    counts.enrollmentChanges++;
  }
  const team = await ensureGroup(ctx, year.id, { type: "grade_team", name: `Grade ${s.grade} Team`, gradeLevel: s.grade });
  if ((await setCurrentGroup(ctx, student.id, year.id, "grade_team", team, entryDate)) !== "unchanged") counts.homeroomChanges++;

  // Contacts Clever lists. A blank phone or email never erases what the SIS has.
  const listed = new Set<string>();
  for (const [i, c] of s.contacts.entries()) {
    const key = `${s.cleverId}#${c.firstName.toLowerCase()} ${c.lastName.toLowerCase()}`;
    const existingContact = (await findByExternalId(ctx, "clever", "contacts", key)) ?? (await findCurrentContactByName(ctx, student.id, c.firstName, c.lastName));
    const result = await upsertImportedContact(ctx, student.id, existingContact, {
      firstName: c.firstName, lastName: c.lastName, relationship: c.relationship, isGuardian: c.isGuardian,
      phonePrimary: (c.phone ?? undefined) as string | null, phoneSecondary: undefined as unknown as string | null,
      email: (c.email ?? undefined) as string | null,
    }, i + 1);
    await rememberExternalId(ctx, "clever", "contacts", key, result.id);
    listed.add(result.id);
    if (result.change !== "unchanged") counts.contactChanges++;
  }
  // Contacts an earlier Clever file listed for this student but this one doesn't.
  const earlier = await ctx.db.select({ entityId: externalIds.entityId }).from(externalIds)
    .where(and(eq(externalIds.schoolId, ctx.schoolId), eq(externalIds.source, "clever"), eq(externalIds.entity, "contacts"), sql`${externalIds.externalId} like ${`${s.cleverId}#%`}`));
  for (const { entityId } of earlier) {
    if (!listed.has(entityId) && (await endContactLink(ctx, student.id, entityId))) counts.contactChanges++;
  }

  const supports = [...(s.iep ? [{ type: "iep" as const }] : []), ...(s.ell ? [{ type: "ell" as const }] : [])];
  // Only the types Clever answered (Y or N) are managed; a blank leaves them alone.
  const managed = [...(s.iep !== null ? ["iep" as const] : []), ...(s.ell !== null ? ["ell" as const] : [])];
  if ((await syncImportedSupports(ctx, student.id, managed, supports)) !== "unchanged") counts.supportChanges++;

  const demographics = {
    ...(s.gender ? { gender: s.gender } : {}),
    ...(s.ethnicity.length ? { ethnicity: s.ethnicity } : {}),
    ...(s.homeAddress ? { homeAddress: s.homeAddress } : {}),
  };
  if (Object.keys(demographics).length && (await upsertImportedDemographics(ctx, student.id, demographics)) !== "unchanged") {
    counts.demographicsChanges++;
  }
  return student.id;
}

/**
 * Imports one set of Clever files. With `dryRun`, everything runs and is then
 * rolled back, so the preview shows exactly what confirming would do.
 */
export async function importClever(
  db: Db,
  files: Partial<Record<CleverFile, string>>,
  options: { schoolId: string; today: string; dryRun: boolean },
): Promise<CleverResult | { refused: string }> {
  const data = readCleverFiles(files);
  const refusal = await refuseCleverData(db, data);
  if (refusal) return { refused: refusal };

  const counts: CleverCounts = {
    students: data.students.length, studentsCreated: 0, studentsUpdated: 0, enrollmentChanges: 0, contactChanges: 0,
    supportChanges: 0, demographicsChanges: 0, sections: data.sections.length, sectionsCreated: 0, sectionsUpdated: 0,
    sectionsArchived: 0, sectionTeacherChanges: 0, sectionStudentsAdded: 0, sectionStudentsEnded: 0, homeroomChanges: 0,
    homeroomTeacherChanges: 0, problems: data.problems.length, droppedStaffEmails: data.droppedStaffEmails,
  };
  const result: CleverResult = { counts, problems: [...data.problems], homerooms: [], unmatchedTeachers: [], missingFromClever: 0, runId: null };

  const actor = await importActor(db, options.schoolId);
  const run = options.dryRun
    ? null
    : (await db.insert(importRuns).values({ schoolId: options.schoolId, createdBy: actor, source: "clever", kind: "roster" }).returning({ id: importRuns.id }))[0]!;

  try {
    await db.transaction(async (tx) => {
      const [year] = await tx.select({ id: schoolYears.id, startsOn: schoolYears.startsOn }).from(schoolYears)
        .where(and(eq(schoolYears.schoolId, options.schoolId), lte(schoolYears.startsOn, options.today), gte(schoolYears.endsOn, options.today)));
      if (!year) throw new Error("No school year covers today");
      const ctx = importContext(tx, options.schoolId, actor, options.today);

      const studentIds = new Map<string, string>();
      for (const s of data.students) studentIds.set(s.cleverId, await applyStudent(ctx, year, s, counts));

      // Clever teacher IDs → staff, by email. Staff themselves come from Google Directory.
      const staffByEmail = new Map(
        (await tx.select({ id: staff.id, email: staff.email }).from(staff).where(eq(staff.schoolId, options.schoolId)))
          .map((r) => [r.email.toLowerCase(), r.id]),
      );
      const staffFor = (teacherId: string) => {
        const email = data.teacherEmails.get(teacherId);
        const id = email ? staffByEmail.get(email) : undefined;
        if (!id && !result.unmatchedTeachers.includes(teacherId)) result.unmatchedTeachers.push(teacherId);
        return id;
      };

      const homerooms = await homeroomNames(ctx, year.id);
      const homeroomOf = new Map<string, string>(); // student → homeroom group
      const homeroomTeachers = new Map<string, Set<string>>(); // homeroom group → staff
      const seenSections = new Set<string>();
      for (const sec of data.sections) {
        const courseId = sec.course ? await upsertCourse(ctx, year.id, sec.course) : null;
        const existing = await findByExternalId(ctx, "clever", "sections", sec.cleverId);
        const section = await upsertSection(ctx, existing, {
          schoolYearId: year.id, courseId, name: sec.name, sectionNumber: sec.sectionNumber, period: sec.period, gradeLevel: sec.grade,
          termName: sec.termName, termStartsOn: sec.termStartsOn, termEndsOn: sec.termEndsOn,
        });
        await rememberExternalId(ctx, "clever", "sections", sec.cleverId, section.id);
        seenSections.add(section.id);
        if (section.change === "created") counts.sectionsCreated++;
        if (section.change === "updated") counts.sectionsUpdated++;

        const teachers = sec.teacherIds.map((t, i) => ({ staffId: staffFor(t), role: i === 0 ? ("primary" as const) : ("co_teacher" as const) }))
          .filter((t): t is { staffId: string; role: "primary" | "co_teacher" } => Boolean(t.staffId));
        counts.sectionTeacherChanges += await syncSectionStaff(ctx, section.id, teachers);
        const members = (data.enrollments.get(sec.cleverId) ?? []).map((id) => studentIds.get(id)).filter((x): x is string => Boolean(x));
        const changed = await syncSectionEnrollments(ctx, section.id, members);
        counts.sectionStudentsAdded += changed.added;
        counts.sectionStudentsEnded += changed.ended;

        const homeroom = homeroomFor(sec, homerooms);
        if (homeroom) {
          const grades = members.length ? data.students.filter((s) => members.includes(studentIds.get(s.cleverId)!)).map((s) => s.grade) : [];
          const grade = sec.grade ?? (grades.length ? grades.sort((a, b) => grades.filter((g) => g === b).length - grades.filter((g) => g === a).length)[0]! : null);
          if (grade) {
            const groupId = await ensureGroup(ctx, year.id, { type: "homeroom", name: homeroom, gradeLevel: grade });
            if (!homerooms.includes(homeroom)) homerooms.push(homeroom);
            result.homerooms.push({ section: sec.name, homeroom });
            for (const m of members) homeroomOf.set(m, groupId);
            const set = homeroomTeachers.get(groupId) ?? new Set<string>();
            teachers.forEach((t) => set.add(t.staffId));
            homeroomTeachers.set(groupId, set);
          }
        }
      }

      // Sections an earlier Clever file had but this one doesn't.
      const known = await tx.select({ entityId: externalIds.entityId }).from(externalIds)
        .where(and(eq(externalIds.schoolId, options.schoolId), eq(externalIds.source, "clever"), eq(externalIds.entity, "sections")));
      for (const { entityId } of known) {
        if (!seenSections.has(entityId) && (await archiveSection(ctx, entityId))) counts.sectionsArchived++;
      }

      // Homerooms come from homeroom sections, when the files have any.
      if (homeroomTeachers.size > 0) {
        for (const s of data.students) {
          const id = studentIds.get(s.cleverId)!;
          const groupId = homeroomOf.get(id);
          if (groupId && (await setCurrentGroup(ctx, id, year.id, "homeroom", groupId, ctx.today)) !== "unchanged") counts.homeroomChanges++;
        }
        for (const [groupId, staffIds] of homeroomTeachers) counts.homeroomTeacherChanges += await syncGroupStaff(ctx, groupId, "homeroom_teacher", [...staffIds]);
      }

      const inFile = [...studentIds.values()];
      const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(
        eq(enrollments.schoolId, options.schoolId), eq(enrollments.schoolYearId, year.id), eq(enrollments.status, "active"),
        isNull(enrollments.exitDate), ...(inFile.length ? [notInArray(enrollments.studentId, inFile)] : []),
      ))) as [{ n: number }];
      result.missingFromClever = n;

      if (options.dryRun) throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) {
      if (run) {
        await db.update(importRuns).set({ status: "failed", finishedAt: new Date(), counts, errorSummary: error instanceof Error ? error.message : "Import failed" })
          .where(eq(importRuns.id, run.id));
      }
      throw error;
    }
  }
  if (run) {
    await db.update(importRuns)
      .set({ status: "succeeded", finishedAt: new Date(), counts, errorSummary: result.problems.length ? result.problems.slice(0, 50).join("\n") : null })
      .where(eq(importRuns.id, run.id));
    result.runId = run.id;
  }
  return result;
}
