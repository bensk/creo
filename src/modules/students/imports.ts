import { and, eq, isNull, sql } from "drizzle-orm";
import { users } from "@/core/identity/schema";
import { dayBefore, diff, type ImportContext } from "@/core/imports/context";
import { contacts, enrollments, studentContacts, studentDemographics, studentHealth, studentSupports, students } from "./schema";

// Public write functions for importers (integrations module). Each is
// idempotent and audits what it changes. Only fields an import owns are
// written: preferred names, pronouns, and custom fields belong to the SIS.

export interface ImportedStudent {
  legalFirstName: string;
  legalLastName: string;
  osis: string | null;
  dateOfBirth: string | null;
  /** Undefined = the source has no value; leave whatever the SIS has. */
  mediaConsent?: "yes" | "no" | "ask_first";
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
    .select({
      legalFirstName: students.legalFirstName, legalLastName: students.legalLastName, osis: students.osis,
      dateOfBirth: students.dateOfBirth, mediaConsent: students.mediaConsent,
    })
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

export type SupportType = "iep" | "504" | "ell";

export interface WantedSupport {
  type: SupportType;
  /** Undefined: keep what the row has (a source that only says yes/no). */
  details?: string | null;
  accommodations?: string[];
}

/**
 * Keeps import-sourced supports of the `managed` types in line with `wanted`.
 * Types a source doesn't report are left alone (Clever has no 504 column), and
 * manually entered supports are never touched. A support the source stops
 * reporting ends yesterday. Returns what changed.
 */
export async function syncImportedSupports(ctx: ImportContext, studentId: string, managed: readonly SupportType[], wanted: readonly WantedSupport[]) {
  const current = (await ctx.db
    .select()
    .from(studentSupports)
    .where(and(eq(studentSupports.studentId, studentId), eq(studentSupports.source, "import"), isNull(studentSupports.endsOn))))
    .filter((r) => managed.includes(r.type as SupportType));
  let change: "created" | "updated" | "ended" | "unchanged" = "unchanged";
  for (const row of current) {
    if (wanted.some((w) => w.type === row.type)) continue;
    const endsOn = dayBefore(ctx.today) < row.startsOn ? row.startsOn : dayBefore(ctx.today);
    await ctx.db.update(studentSupports).set({ endsOn }).where(eq(studentSupports.id, row.id));
    await ctx.audit("student_support.end", "student_supports", row.id, null, { endsOn });
    change = "ended";
  }
  for (const w of wanted) {
    if (!managed.includes(w.type)) continue;
    const existing = current.find((r) => r.type === w.type);
    if (!existing) {
      // A manually entered support of the same type already covers it.
      const [manual] = await ctx.db.select({ id: studentSupports.id }).from(studentSupports)
        .where(and(eq(studentSupports.studentId, studentId), eq(studentSupports.type, w.type), isNull(studentSupports.endsOn)));
      if (manual) continue;
      const [row] = await ctx.db
        .insert(studentSupports)
        .values({
          schoolId: ctx.schoolId, createdBy: ctx.actorUserId, studentId, type: w.type, details: w.details ?? null,
          accommodations: w.accommodations ?? [], startsOn: ctx.today, source: "import",
        })
        .returning({ id: studentSupports.id });
      // Audit values stay out of the log entry's "after": supports are sensitive.
      await ctx.audit("student_support.create", "student_supports", row!.id, null, { source: "import" });
      change = "created";
      continue;
    }
    const fields = {
      ...(w.details !== undefined ? { details: w.details } : {}),
      ...(w.accommodations !== undefined ? { accommodations: w.accommodations } : {}),
    };
    const same = (fields.details === undefined || fields.details === existing.details)
      && (fields.accommodations === undefined || fields.accommodations.join("|") === existing.accommodations.join("|"));
    if (same) continue;
    await ctx.db.update(studentSupports).set(fields).where(eq(studentSupports.id, existing.id));
    await ctx.audit("student_support.update", "student_supports", existing.id, null, { source: "import" });
    if (change === "unchanged") change = "updated";
  }
  return change;
}

/** The Big Data Tracker's IEP/504: it manages both types and reports at most one. */
export function syncImportedSupport(
  ctx: ImportContext,
  studentId: string,
  wanted: { type: "iep" | "504"; details: string | null; accommodations: string[] } | null,
) {
  return syncImportedSupports(ctx, studentId, ["iep", "504"], wanted ? [wanted] : []);
}

/** Updates only the given student fields (a source that owns some fields but not others). */
export async function updateImportedStudentFields(ctx: ImportContext, studentId: string, data: Partial<ImportedStudent>) {
  const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<ImportedStudent>;
  if (Object.keys(defined).length === 0) return "unchanged" as const;
  const [current] = await ctx.db
    .select({
      legalFirstName: students.legalFirstName, legalLastName: students.legalLastName, osis: students.osis,
      dateOfBirth: students.dateOfBirth, mediaConsent: students.mediaConsent,
    })
    .from(students)
    .where(eq(students.id, studentId));
  const d = diff(current!, defined);
  if (!d.changed) return "unchanged" as const;
  await ctx.db.update(students).set({ ...defined, version: sql`${students.version} + 1` }).where(eq(students.id, studentId));
  await ctx.audit("student.update", "students", studentId, d.before, d.after);
  return "updated" as const;
}

/** One of the student's current contacts with this name, if any (so two sources don't create the same parent twice). */
export async function findCurrentContactByName(ctx: ImportContext, studentId: string, firstName: string, lastName: string): Promise<string | null> {
  const [row] = await ctx.db
    .select({ id: contacts.id })
    .from(studentContacts)
    .innerJoin(contacts, eq(contacts.id, studentContacts.contactId))
    .where(and(
      eq(studentContacts.studentId, studentId), isNull(studentContacts.endsOn),
      sql`lower(${contacts.firstName}) = lower(${firstName})`, sql`lower(${contacts.lastName}) = lower(${lastName})`,
    ))
    .limit(1);
  return row?.id ?? null;
}

/** Ends a student's current link to a contact (the source no longer lists them). The contact record stays. */
export async function endContactLink(ctx: ImportContext, studentId: string, contactId: string): Promise<boolean> {
  const [link] = await ctx.db
    .select({ id: studentContacts.id, startsOn: studentContacts.startsOn })
    .from(studentContacts)
    .where(and(eq(studentContacts.studentId, studentId), eq(studentContacts.contactId, contactId), isNull(studentContacts.endsOn)));
  if (!link) return false;
  const endsOn = dayBefore(ctx.today) < link.startsOn ? link.startsOn : dayBefore(ctx.today);
  await ctx.db.update(studentContacts).set({ endsOn }).where(eq(studentContacts.id, link.id));
  await ctx.audit("student_contact.end", "student_contacts", link.id, null, { endsOn });
  return true;
}

/** Currently enrolled students in a grade, with what's needed to match a Google account. */
export async function enrolledStudentsInGrade(ctx: ImportContext, grade: number) {
  return ctx.db
    .select({
      id: students.id, legalFirstName: students.legalFirstName, legalLastName: students.legalLastName,
      preferredFirstName: students.preferredFirstName, preferredLastName: students.preferredLastName,
      googleEmail: students.googleEmail,
    })
    .from(students)
    .innerJoin(enrollments, eq(enrollments.studentId, students.id))
    .where(and(eq(students.schoolId, ctx.schoolId), eq(enrollments.gradeLevel, grade), eq(enrollments.status, "active"), isNull(enrollments.exitDate)));
}

export async function studentByGoogleEmail(ctx: ImportContext, email: string) {
  const [row] = await ctx.db.select({ id: students.id }).from(students).where(and(eq(students.schoolId, ctx.schoolId), eq(students.googleEmail, email)));
  return row?.id ?? null;
}

export async function studentGoogleEmail(ctx: ImportContext, studentId: string) {
  const [row] = await ctx.db.select({ googleEmail: students.googleEmail }).from(students).where(eq(students.id, studentId));
  return row?.googleEmail ?? null;
}

/**
 * Links a student's Google account: sets google_email and creates or updates
 * their sign-in identity (users row, kind student). Audited.
 */
export async function linkStudentAccount(ctx: ImportContext, studentId: string, email: string, displayName: string) {
  const [current] = await ctx.db.select({ userId: students.userId, googleEmail: students.googleEmail }).from(students).where(eq(students.id, studentId));
  let userId = current!.userId;
  if (!userId) {
    const [u] = await ctx.db
      .insert(users)
      .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, kind: "student", email, displayName })
      .returning({ id: users.id });
    userId = u!.id;
  } else {
    await ctx.db.update(users).set({ email }).where(eq(users.id, userId));
  }
  await ctx.db.update(students).set({ googleEmail: email, userId, version: sql`${students.version} + 1` }).where(eq(students.id, studentId));
  await ctx.audit("student.link_google_account", "students", studentId, { googleEmail: current!.googleEmail }, { googleEmail: email });
}

/**
 * One-row-per-student tables (health, demographics): create or overwrite with
 * the import's values. Audit entries name the fields that changed, not their
 * values, because both tables are above standard sensitivity.
 */
async function upsertOneRow<T extends Record<string, unknown>>(
  ctx: ImportContext,
  table: typeof studentHealth | typeof studentDemographics,
  entity: string,
  studentId: string,
  values: T,
): Promise<"created" | "updated" | "unchanged"> {
  const [current] = await ctx.db.select().from(table).where(eq(table.studentId, studentId));
  if (!current) {
    const [row] = await ctx.db
      .insert(table)
      .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, studentId, source: "import", ...values } as never)
      .returning({ id: table.id });
    await ctx.audit(`${entity}.create`, entity, row!.id, null, { source: "import" });
    return "created";
  }
  const changed = Object.keys(values).filter((k) => JSON.stringify((current as Record<string, unknown>)[k]) !== JSON.stringify(values[k]));
  if (changed.length === 0) return "unchanged";
  await ctx.db.update(table).set({ ...values, source: "import" } as never).where(eq(table.id, current.id));
  await ctx.audit(`${entity}.update`, entity, current.id, null, { fields: changed });
  return "updated";
}

export function upsertImportedHealth(ctx: ImportContext, studentId: string, values: Omit<typeof studentHealth.$inferInsert, "schoolId" | "createdBy" | "studentId" | "source">) {
  return upsertOneRow(ctx, studentHealth, "student_health", studentId, values);
}

export function upsertImportedDemographics(ctx: ImportContext, studentId: string, values: Omit<typeof studentDemographics.$inferInsert, "schoolId" | "createdBy" | "studentId" | "source">) {
  return upsertOneRow(ctx, studentDemographics, "student_demographics", studentId, values);
}
