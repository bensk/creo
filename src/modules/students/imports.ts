import { and, eq, isNull, sql } from "drizzle-orm";
import { dayBefore, diff, type ImportContext } from "@/core/imports/context";
import { contacts, enrollments, studentContacts, studentSupports, students } from "./schema";

// Public write functions for importers (integrations module). Each is
// idempotent and audits what it changes. Only fields an import owns are
// written: preferred names, pronouns, and custom fields belong to the SIS.

export interface ImportedStudent {
  legalFirstName: string;
  legalLastName: string;
  osis: string | null;
  dateOfBirth: string | null;
}

export async function findStudentByOsis(ctx: ImportContext, osis: string): Promise<string | null> {
  const [row] = await ctx.db.select({ id: students.id }).from(students).where(and(eq(students.schoolId, ctx.schoolId), eq(students.osis, osis)));
  return row?.id ?? null;
}

export async function upsertImportedStudent(ctx: ImportContext, existingId: string | null, data: ImportedStudent) {
  if (!existingId) {
    const [row] = await ctx.db.insert(students).values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, ...data }).returning({ id: students.id });
    await ctx.audit("student.create", "students", row!.id, null, { source: "import" });
    return { id: row!.id, change: "created" as const };
  }
  const [current] = await ctx.db
    .select({ legalFirstName: students.legalFirstName, legalLastName: students.legalLastName, osis: students.osis, dateOfBirth: students.dateOfBirth })
    .from(students)
    .where(eq(students.id, existingId));
  const d = diff(current!, data);
  if (!d.changed) return { id: existingId, change: "unchanged" as const };
  await ctx.db.update(students).set({ ...data, version: sql`${students.version} + 1` }).where(eq(students.id, existingId));
  await ctx.audit("student.update", "students", existingId, d.before, d.after);
  return { id: existingId, change: "updated" as const };
}

/** The student's enrollment for this school year: created, regraded, or withdrawn to match the import. */
export async function syncImportedEnrollment(
  ctx: ImportContext,
  studentId: string,
  data: { schoolYearId: string; grade: number; entryDate: string; withdrawn: boolean },
) {
  const [current] = await ctx.db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.schoolYearId, data.schoolYearId)))
    .orderBy(sql`${enrollments.entryDate} desc`)
    .limit(1);
  if (!current) {
    if (data.withdrawn) return "unchanged";
    const [row] = await ctx.db
      .insert(enrollments)
      .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, studentId, schoolYearId: data.schoolYearId, gradeLevel: data.grade, status: "active", entryDate: data.entryDate })
      .returning({ id: enrollments.id });
    await ctx.audit("enrollment.create", "enrollments", row!.id, null, { gradeLevel: data.grade, entryDate: data.entryDate });
    return "created";
  }
  const next =
    data.withdrawn && current.status === "active"
      ? { status: "withdrawn", exitDate: ctx.today < current.entryDate ? current.entryDate : ctx.today, gradeLevel: data.grade }
      : { gradeLevel: data.grade };
  const d = diff(current as Record<string, unknown>, next);
  if (!d.changed) return "unchanged";
  await ctx.db.update(enrollments).set(next).where(eq(enrollments.id, current.id));
  await ctx.audit(data.withdrawn ? "enrollment.withdraw" : "enrollment.update", "enrollments", current.id, d.before, d.after);
  return "updated";
}

export interface ImportedContact {
  firstName: string;
  lastName: string;
  email: string | null;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  relationship: string;
  isGuardian: boolean;
}

/** Creates or updates a contact and keeps a current link to the student. Portal access is never granted by import. */
export async function upsertImportedContact(ctx: ImportContext, studentId: string, existingId: string | null, data: ImportedContact, priority: number) {
  const fields = { firstName: data.firstName, lastName: data.lastName, email: data.email, phonePrimary: data.phonePrimary, phoneSecondary: data.phoneSecondary };
  let contactId = existingId;
  let change: "created" | "updated" | "unchanged" = "unchanged";
  if (!contactId) {
    const [row] = await ctx.db.insert(contacts).values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, ...fields }).returning({ id: contacts.id });
    contactId = row!.id;
    change = "created";
    await ctx.audit("contact.create", "contacts", contactId, null, { source: "import" });
  } else {
    const [current] = await ctx.db
      .select({
        firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email,
        phonePrimary: contacts.phonePrimary, phoneSecondary: contacts.phoneSecondary,
      })
      .from(contacts)
      .where(eq(contacts.id, contactId));
    const d = diff(current!, fields);
    if (d.changed) {
      await ctx.db.update(contacts).set(fields).where(eq(contacts.id, contactId));
      await ctx.audit("contact.update", "contacts", contactId, d.before, d.after);
      change = "updated";
    }
  }

  const link = { relationship: data.relationship, isGuardian: data.isGuardian, pickupAllowed: data.isGuardian, contactPriority: priority };
  const [currentLink] = await ctx.db
    .select()
    .from(studentContacts)
    .where(and(eq(studentContacts.studentId, studentId), eq(studentContacts.contactId, contactId), isNull(studentContacts.endsOn)));
  if (!currentLink) {
    const [row] = await ctx.db
      .insert(studentContacts)
      .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, studentId, contactId, ...link, startsOn: ctx.today })
      .returning({ id: studentContacts.id });
    await ctx.audit("student_contact.create", "student_contacts", row!.id, null, link);
    if (change === "unchanged") change = "updated";
  } else {
    const d = diff(currentLink as Record<string, unknown>, link);
    if (d.changed) {
      await ctx.db.update(studentContacts).set(link).where(eq(studentContacts.id, currentLink.id));
      await ctx.audit("student_contact.update", "student_contacts", currentLink.id, d.before, d.after);
      if (change === "unchanged") change = "updated";
    }
  }
  return { id: contactId, change };
}

/**
 * Keeps import-sourced IEP/504 rows in line with the import. Manually entered
 * supports are never touched. A support the import no longer reports ends yesterday.
 */
export async function syncImportedSupport(
  ctx: ImportContext,
  studentId: string,
  wanted: { type: "iep" | "504"; details: string | null; accommodations: string[] } | null,
) {
  const current = await ctx.db
    .select()
    .from(studentSupports)
    .where(and(eq(studentSupports.studentId, studentId), eq(studentSupports.source, "import"), isNull(studentSupports.endsOn)));
  let change: "created" | "updated" | "ended" | "unchanged" = "unchanged";
  for (const row of current) {
    if (wanted && row.type === wanted.type) continue;
    const endsOn = dayBefore(ctx.today) < row.startsOn ? row.startsOn : dayBefore(ctx.today);
    await ctx.db.update(studentSupports).set({ endsOn }).where(eq(studentSupports.id, row.id));
    await ctx.audit("student_support.end", "student_supports", row.id, null, { endsOn });
    change = "ended";
  }
  if (!wanted) return change;
  const existing = current.find((r) => r.type === wanted.type);
  const fields = { details: wanted.details, accommodations: wanted.accommodations };
  if (!existing) {
    const [row] = await ctx.db
      .insert(studentSupports)
      .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, studentId, type: wanted.type, ...fields, startsOn: ctx.today, source: "import" })
      .returning({ id: studentSupports.id });
    // Audit values stay out of the log entry's "after": supports are sensitive.
    await ctx.audit("student_support.create", "student_supports", row!.id, null, { source: "import" });
    return "created";
  }
  const sameAccommodations = existing.accommodations.join("|") === wanted.accommodations.join("|");
  if (existing.details === wanted.details && sameAccommodations) return change;
  await ctx.db.update(studentSupports).set(fields).where(eq(studentSupports.id, existing.id));
  await ctx.audit("student_support.update", "student_supports", existing.id, null, { source: "import" });
  return "updated";
}
