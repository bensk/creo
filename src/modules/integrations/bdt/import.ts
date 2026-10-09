import { and, eq, gte, lte } from "drizzle-orm";
import { importContext, type ImportContext } from "@/core/imports/context";
import type { Db } from "@/core/db/types";
import { users } from "@/core/identity/schema";
import { schoolYears } from "@/core/school/schema";
import { ensureGroup, setCurrentGroup } from "../../cohorts/imports";
import {
  findStudentByOsis, syncImportedEnrollment, syncImportedSupport, upsertImportedContact, upsertImportedStudent,
} from "../../students/imports";
import { findByExternalId, rememberExternalId } from "../external-ids";
import type { NotionSource } from "../notion/client";
import { importRuns } from "../schema";
import { mapBdtRow, type BdtStudent } from "./map";

// The Big Data Tracker import: Notion → students, enrollments, homerooms,
// contacts, and IEP/504 supports. Until cutover the tracker is the source of
// truth for these fields; everything else on a student belongs to the SIS.
// Re-running is safe: records are matched by Notion page ID, then by OSIS.

export interface ImportCounts {
  rows: number;
  invalid: number;
  studentsCreated: number;
  studentsUpdated: number;
  studentsUnchanged: number;
  enrollmentChanges: number;
  homeroomChanges: number;
  contactChanges: number;
  supportChanges: number;
  droppedStaffEmails: number;
}

const ACTOR_NAME = "Big Data Tracker import";

async function importActor(db: Db, schoolId: string): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.schoolId, schoolId), eq(users.kind, "system"), eq(users.displayName, ACTOR_NAME)));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, schoolId, createdBy: id, kind: "system", displayName: ACTOR_NAME });
  return id;
}

async function applyStudent(ctx: ImportContext, schoolYearId: string, yearStart: string, row: BdtStudent, counts: ImportCounts) {
  const existing = (await findByExternalId(ctx, "big_data_tracker", "students", row.pageId)) ?? (row.osis ? await findStudentByOsis(ctx, row.osis) : null);
  const student = await upsertImportedStudent(ctx, existing, {
    legalFirstName: row.legalFirstName, legalLastName: row.legalLastName, osis: row.osis, dateOfBirth: row.dateOfBirth,
  });
  await rememberExternalId(ctx, "big_data_tracker", "students", row.pageId, student.id);
  if (student.change === "created") counts.studentsCreated++;
  else if (student.change === "updated") counts.studentsUpdated++;
  else counts.studentsUnchanged++;

  const entryDate = row.entryDate && row.entryDate >= yearStart ? row.entryDate : yearStart;
  if ((await syncImportedEnrollment(ctx, student.id, { schoolYearId, grade: row.grade, entryDate, withdrawn: row.withdrawn })) !== "unchanged") {
    counts.enrollmentChanges++;
  }

  const homeroomId = row.homeroom && !row.withdrawn
    ? await ensureGroup(ctx, schoolYearId, { type: "homeroom", name: row.homeroom.name, gradeLevel: row.homeroom.grade })
    : null;
  const teamId = row.withdrawn
    ? null
    : await ensureGroup(ctx, schoolYearId, { type: "grade_team", name: `Grade ${row.grade} Team`, gradeLevel: row.grade });
  for (const [type, groupId] of [["homeroom", homeroomId], ["grade_team", teamId]] as const) {
    if (type === "homeroom" && !groupId && !row.withdrawn) continue; // no homeroom listed yet: leave as is
    if ((await setCurrentGroup(ctx, student.id, schoolYearId, type, groupId, entryDate)) !== "unchanged") counts.homeroomChanges++;
  }

  for (const [i, contact] of row.contacts.entries()) {
    const key = `${row.pageId}#${contact.slot}`;
    const existingContact = await findByExternalId(ctx, "big_data_tracker", "contacts", key);
    const result = await upsertImportedContact(ctx, student.id, existingContact, contact, i + 1);
    await rememberExternalId(ctx, "big_data_tracker", "contacts", key, result.id);
    if (result.change !== "unchanged") counts.contactChanges++;
  }

  const support = row.support ? { ...row.support, accommodations: row.accommodations } : null;
  if ((await syncImportedSupport(ctx, student.id, support)) !== "unchanged") counts.supportChanges++;
  counts.droppedStaffEmails += row.droppedStaffEmails;
}

/**
 * Runs the whole import in one transaction and records the run. A row that
 * can't be mapped is skipped and reported by row number; it never stops the rest.
 */
export async function importBigDataTracker(db: Db, source: NotionSource, options: { schoolId: string; today: string }) {
  const pages = await source.listPages();
  const counts: ImportCounts = {
    rows: pages.length, invalid: 0, studentsCreated: 0, studentsUpdated: 0, studentsUnchanged: 0,
    enrollmentChanges: 0, homeroomChanges: 0, contactChanges: 0, supportChanges: 0, droppedStaffEmails: 0,
  };
  const errors: string[] = [];

  const actor = await importActor(db, options.schoolId);
  const [run] = await db
    .insert(importRuns)
    .values({ schoolId: options.schoolId, createdBy: actor, source: "big_data_tracker", kind: "students" })
    .returning({ id: importRuns.id });

  try {
    await db.transaction(async (tx) => {
      const [year] = await tx
        .select({ id: schoolYears.id, startsOn: schoolYears.startsOn })
        .from(schoolYears)
        .where(and(eq(schoolYears.schoolId, options.schoolId), lte(schoolYears.startsOn, options.today), gte(schoolYears.endsOn, options.today)));
      if (!year) throw new Error("No school year covers today");
      const ctx = importContext(tx, options.schoolId, actor, options.today);
      const mapped = pages.map((page, i) => mapBdtRow(page, i + 1));
      // Two rows with the same OSIS would merge into one student: skip both and say so.
      const rowsByOsis = new Map<string, number[]>();
      mapped.forEach((m, i) => {
        if (m.ok && m.student.osis) rowsByOsis.set(m.student.osis, [...(rowsByOsis.get(m.student.osis) ?? []), i + 1]);
      });
      const duplicate = new Map<number, number[]>();
      for (const rows of rowsByOsis.values()) if (rows.length > 1) for (const r of rows) duplicate.set(r, rows);

      for (const [i, m] of mapped.entries()) {
        const rowNumber = i + 1;
        if (!m.ok) {
          counts.invalid++;
          errors.push(m.error);
          continue;
        }
        const others = duplicate.get(rowNumber);
        if (others) {
          counts.invalid++;
          errors.push(`row ${rowNumber}: OSIS is the same as row ${others.filter((r) => r !== rowNumber).join(", ")}`);
          continue;
        }
        await applyStudent(ctx, year.id, year.startsOn, m.student, counts);
      }
    });
    await db.update(importRuns)
      .set({ status: "succeeded", finishedAt: new Date(), counts, errorSummary: errors.length ? errors.slice(0, 50).join("\n") : null })
      .where(eq(importRuns.id, run!.id));
    return { ok: true as const, runId: run!.id, counts, errors };
  } catch (error) {
    await db.update(importRuns)
      .set({ status: "failed", finishedAt: new Date(), counts, errorSummary: error instanceof Error ? error.message : "Import failed" })
      .where(eq(importRuns.id, run!.id));
    throw error;
  }
}
