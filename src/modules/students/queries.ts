import { and, eq, isNull, gte, lte, or } from "drizzle-orm";
import { currentOn, schoolToday } from "@/core/db/dates";
import type { Db } from "@/core/db/types";
import { schools } from "@/core/identity/schema";
import { contacts, enrollments, studentContacts, students } from "./schema";

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
