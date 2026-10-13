import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { currentOn, schoolToday } from "@/core/db/dates";
import type { Db } from "@/core/db/types";
import { schools } from "@/core/identity/schema";
import { contacts, enrollments, namePronunciations, studentContacts, studentDemographics, studentHealth, studentSupports, students } from "./schema";

// Public queries other modules and core may use. Nothing outside this module
// reads its tables directly.

/** The student linked to a user, and whether they are enrolled today. */
export async function studentAccessForUser(db: Db, userId: string) {
  const [person] = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId));
  if (!person) return null;
  const [enrolled] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(schools, eq(schools.id, enrollments.schoolId))
    .where(
      and(
        eq(enrollments.studentId, person.id),
        eq(enrollments.status, "active"),
        lte(enrollments.entryDate, schoolToday),
        or(isNull(enrollments.exitDate), gte(enrollments.exitDate, schoolToday)),
      ),
    )
    .limit(1);
  return { studentId: person.id, enrolled: Boolean(enrolled) };
}

/** The contact linked to a user and the children they currently have portal access for. */
export async function familyAccessForUser(db: Db, userId: string) {
  const [person] = await db
    .select({ id: contacts.id, language: contacts.language })
    .from(contacts)
    .where(eq(contacts.userId, userId));
  if (!person) return null;
  const children = await db
    .selectDistinct({ studentId: studentContacts.studentId })
    .from(studentContacts)
    .innerJoin(schools, eq(schools.id, studentContacts.schoolId))
    .where(
      and(
        eq(studentContacts.contactId, person.id),
        eq(studentContacts.portalAccess, true),
        currentOn(studentContacts.startsOn, studentContacts.endsOn),
      ),
    );
  return { contactId: person.id, language: person.language, studentIds: children.map((c) => c.studentId).sort() };
}

/**
 * Students whose preferred or legal name matches every word of the query,
 * currently enrolled first. Standard fields only.
 */
export async function searchStudents(db: Db, schoolId: string, query: string, limit = 8) {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length === 0) return [];
  const nameText = sql`concat_ws(' ', ${students.preferredFirstName}, ${students.legalFirstName}, ${students.preferredLastName}, ${students.legalLastName})`;
  const matches = words.map((w) => sql`${nameText} ilike ${`%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`);
  // Correlated subqueries name the outer table explicitly: inside a subquery,
  // drizzle renders a bare column name, which Postgres would resolve to the inner table.
  const outerId = sql.raw(`"students"."id"`);
  const enrolled = sql<boolean>`exists (
    select 1 from enrollments e
    where e.student_id = ${outerId} and e.status = 'active' and e.exit_date is null
  )`;
  const grade = sql<number | null>`(
    select e.grade_level from enrollments e
    where e.student_id = ${outerId}
    order by e.entry_date desc limit 1
  )`;
  return db
    .select({
      id: students.id,
      legalFirstName: students.legalFirstName,
      legalLastName: students.legalLastName,
      preferredFirstName: students.preferredFirstName,
      preferredLastName: students.preferredLastName,
      grade,
      enrolled,
      phonetic: sql<string | null>`(
        select np.phonetic from name_pronunciations np
        where np.student_id = ${outerId} order by np.created_at desc limit 1
      )`,
      // The current pronunciation's id when it has a recording (for the play button).
      audioId: sql<string | null>`(
        select case when np.audio_object_key is not null then np.id end from name_pronunciations np
        where np.student_id = ${outerId} order by np.created_at desc limit 1
      )`,
    })
    .from(students)
    .where(and(eq(students.schoolId, schoolId), ...matches))
    .orderBy(sql`${enrolled} desc`, students.legalLastName, students.legalFirstName)
    .limit(limit);
}

/** One student's full row (redact with readForViewer before showing it). */
export async function getStudent(db: Db, schoolId: string, studentId: string) {
  const [row] = await db
    .select()
    .from(students)
    .where(and(eq(students.schoolId, schoolId), eq(students.id, studentId)));
  return row ?? null;
}

/** Every enrollment period for a student, newest first. */
export async function enrollmentHistory(db: Db, studentId: string) {
  return db
    .select({
      id: enrollments.id, gradeLevel: enrollments.gradeLevel, status: enrollments.status,
      entryDate: enrollments.entryDate, exitDate: enrollments.exitDate,
    })
    .from(enrollments)
    .where(eq(enrollments.studentId, studentId))
    .orderBy(sql`${enrollments.entryDate} desc`);
}

/** A student's contacts with how they're related, current links first, by priority. Standard fields only. */
export async function contactsForStudent(db: Db, studentId: string) {
  const current = sql<boolean>`(${studentContacts.endsOn} is null or ${studentContacts.endsOn} >= (now() at time zone "schools"."timezone")::date)`;
  return db
    .select({
      id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email,
      phonePrimary: contacts.phonePrimary, phoneSecondary: contacts.phoneSecondary, language: contacts.language,
      preferredChannel: contacts.preferredChannel, relationship: studentContacts.relationship,
      isGuardian: studentContacts.isGuardian, livesWith: studentContacts.livesWith,
      pickupAllowed: studentContacts.pickupAllowed, portalAccess: studentContacts.portalAccess,
      priority: studentContacts.contactPriority, current,
    })
    .from(studentContacts)
    .innerJoin(contacts, eq(contacts.id, studentContacts.contactId))
    .innerJoin(schools, eq(schools.id, studentContacts.schoolId))
    .where(eq(studentContacts.studentId, studentId))
    .orderBy(sql`${current} desc`, studentContacts.contactPriority);
}

/** A student's supports, current first. Sensitive: read through readForViewer. */
export async function supportsForStudent(db: Db, studentId: string) {
  return db
    .select()
    .from(studentSupports)
    .where(eq(studentSupports.studentId, studentId))
    .orderBy(sql`(${studentSupports.endsOn} is null) desc`, sql`${studentSupports.startsOn} desc`);
}

/** The current pronunciation (newest), if any. */
export async function currentPronunciation(db: Db, studentId: string) {
  const [row] = await db
    .select({ id: namePronunciations.id, phonetic: namePronunciations.phonetic, audioObjectKey: namePronunciations.audioObjectKey })
    .from(namePronunciations)
    .where(eq(namePronunciations.studentId, studentId))
    .orderBy(sql`${namePronunciations.createdAt} desc`)
    .limit(1);
  return row ?? null;
}

/** Health row (sensitive): read through readForViewer. */
export async function healthForStudent(db: Db, studentId: string) {
  const [row] = await db.select().from(studentHealth).where(eq(studentHealth.studentId, studentId));
  return row ?? null;
}

/** Demographics row (restricted): read through readForViewer. */
export async function demographicsForStudent(db: Db, studentId: string) {
  const [row] = await db.select().from(studentDemographics).where(eq(studentDemographics.studentId, studentId));
  return row ?? null;
}
