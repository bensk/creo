import { users } from "../../core/identity/schema";
import {
  BOY_NAMES, emailSlug, GIRL_NAMES, HOMEROOMS, MEN_NAMES, SURNAMES, WOMEN_NAMES,
} from "../../core/seed/names";
import {
  FAMILY_PERSONAS, SIBLING_STUDENT, STAFF_PARENT_CONTACT_EMAIL, STAFF_PERSONAS, STUDENT_PERSONA,
} from "../../core/seed/personas";
import type { Rng } from "../../core/seed/random";
import { GRADES, type Grade, type SeedBatch, type SeedContext, type StudentPlacement } from "../../core/seed/types";
import { contacts, enrollments, studentContacts, students } from "./schema";

export const STUDENTS_PER_HOMEROOM = 25;
const WITHDRAWN_COUNT = 3;
const WITHDRAWN_ON = "2026-10-16";
// Synthetic OSIS numbers all start with 999 so they can't be mistaken for real ones.
const OSIS_PREFIX = "999";

const NICKNAMES: Readonly<Record<string, string>> = {
  Isabella: "Bella", Christopher: "Chris", Jonathan: "Jon", Valentina: "Vale", Sebastian: "Seba",
  Gabriel: "Gabe", Elijah: "Eli", Daniela: "Dani", Alondra: "Alo", Emmanuel: "Manny",
};

interface Slot { grade: Grade; homeroom: string }

interface ChildSpec extends Slot {
  firstName: string;
  preferredFirstName?: string;
  lastName: string;
  pronouns: string;
  fixed: boolean;
}

interface ContactSpec {
  firstName: string;
  lastName: string;
  email: string | null;
  language: "en" | "es";
  relationship: string;
  portalAccess: boolean;
}

const GUARDIAN_RELATIONSHIPS = new Set(["mother", "father", "grandmother", "guardian"]);

function child(rng: Rng, slot: Slot, lastName: string): ChildSpec {
  const girl = rng.chance(0.5);
  const firstName = rng.pick(girl ? GIRL_NAMES : BOY_NAMES);
  const nickname = NICKNAMES[firstName];
  return {
    ...slot,
    firstName,
    preferredFirstName: nickname && rng.chance(0.5) ? nickname : undefined,
    lastName,
    pronouns: rng.chance(0.03) ? "they/them" : girl ? "she/her" : "he/him",
    fixed: false,
  };
}

function familyContacts(rng: Rng, lastName: string, language: "en" | "es"): ContactSpec[] {
  const first = rng.pick(["mother", "mother", "mother", "mother", "father", "grandmother", "guardian"]);
  const relationships = [first];
  if (rng.chance(0.6)) relationships.push(first === "mother" ? rng.pick(["father", "aunt", "grandmother"]) : "mother");
  if (rng.chance(0.15)) relationships.push(rng.pick(["uncle", "aunt", "grandmother"]));

  return relationships.map((relationship) => {
    const woman = ["mother", "grandmother", "aunt"].includes(relationship) || (relationship === "guardian" && rng.chance(0.5));
    const firstName = rng.pick(woman ? WOMEN_NAMES : MEN_NAMES);
    const contactLast = rng.chance(0.75) ? lastName : rng.pick(SURNAMES);
    const email = rng.chance(0.75)
      ? `${emailSlug(firstName, contactLast)}${rng.int(1, 99)}@${rng.pick(["example.com", "example.net", "example.org"])}`
      : null;
    return {
      firstName, lastName: contactLast, email, language, relationship,
      portalAccess: email !== null && GUARDIAN_RELATIONSHIPS.has(relationship),
    };
  });
}

/** Fictional 555-01xx numbers only. */
function phone(rng: Rng): string {
  return `(${rng.pick(["718", "347", "929"])}) 555-01${String(rng.int(0, 99)).padStart(2, "0")}`;
}

function birthDate(rng: Rng, grade: Grade): string {
  return rng.date(`${2026 - grade - 6}-09-01`, `${2026 - grade - 5}-08-31`);
}

export function buildStudentsSeed(ctx: SeedContext): { batches: SeedBatch[]; placements: StudentPlacement[] } {
  const { rng } = ctx;
  const by = { schoolId: ctx.schoolId, createdBy: ctx.systemUserId };

  // Every seat in every homeroom, minus the seats taken by fixed people.
  const fixedSeats: Slot[] = [
    { grade: STUDENT_PERSONA.grade, homeroom: STUDENT_PERSONA.homeroom },
    { grade: SIBLING_STUDENT.grade, homeroom: SIBLING_STUDENT.homeroom },
    { grade: 8, homeroom: "Columbia" }, // the staff-parent's child
  ];
  let seats: Slot[] = GRADES.flatMap((grade) =>
    HOMEROOMS[grade].flatMap((homeroom) => Array.from({ length: STUDENTS_PER_HOMEROOM }, () => ({ grade, homeroom }))),
  );
  for (const fixed of fixedSeats) {
    const i = seats.findIndex((s) => s.grade === fixed.grade && s.homeroom === fixed.homeroom);
    seats.splice(i, 1);
  }
  seats = rng.shuffle(seats);

  // Families: the two fixed ones first, then generated households (some with siblings).
  const families: { children: ChildSpec[]; contacts: ContactSpec[] }[] = [
    {
      children: [
        { ...STUDENT_PERSONA, fixed: true },
        { ...SIBLING_STUDENT, fixed: true },
      ],
      contacts: FAMILY_PERSONAS.map((p) => ({
        firstName: p.firstName, lastName: p.lastName, email: p.email, language: p.language,
        relationship: p.relationship, portalAccess: p.portalAccess,
      })),
    },
  ];
  const staffParent = STAFF_PERSONAS.find((p) => p.key === "staff-parent")!;
  families.push({
    children: [{ ...child(rng, fixedSeats[2]!, staffParent.familyName), fixed: true }],
    contacts: [{
      firstName: staffParent.givenName, lastName: staffParent.familyName, email: STAFF_PARENT_CONTACT_EMAIL,
      language: "en", relationship: "mother", portalAccess: true,
    }],
  });

  while (seats.length > 0) {
    const lastName = rng.pick(SURNAMES);
    const first = seats.pop()!;
    const children = [child(rng, first, lastName)];
    if (rng.chance(0.12)) {
      const i = seats.findIndex((s) => s.grade !== first.grade);
      if (i >= 0) children.push(child(rng, seats.splice(i, 1)[0]!, rng.chance(0.9) ? lastName : rng.pick(SURNAMES)));
    }
    families.push({ children, contacts: familyContacts(rng, lastName, rng.chance(0.45) ? "es" : "en") });
  }

  const studentUsers: Record<string, unknown>[] = [];
  const studentRows: Record<string, unknown>[] = [];
  const familyUsers: Record<string, unknown>[] = [];
  const contactRows: Record<string, unknown>[] = [];
  const linkRows: Record<string, unknown>[] = [];
  const enrollmentRows: Record<string, unknown>[] = [];
  const placements: StudentPlacement[] = [];
  const studentEmails = new Set<string>();
  let osis = 100_000;

  for (const family of families) {
    const studentIds = family.children.map((c) => {
      const studentId = rng.uuid();
      const userId = rng.uuid();
      // Student accounts: first.last.YY, where YY is the graduation year (matches the OU).
      const gradYear = String((2027 + (8 - c.grade)) % 100);
      let local = `${emailSlug(c.firstName, c.lastName)}.${gradYear}`;
      for (let n = 2; studentEmails.has(local); n++) local = `${emailSlug(c.firstName, c.lastName)}${n}.${gradYear}`;
      studentEmails.add(local);
      const googleEmail = `${local}@creoprep.org`;

      studentUsers.push({
        id: userId, ...by, kind: "student", email: googleEmail,
        displayName: `${c.preferredFirstName ?? c.firstName} ${c.lastName}`,
      });
      studentRows.push({
        id: studentId, ...by, userId, legalFirstName: c.firstName, legalLastName: c.lastName,
        preferredFirstName: c.preferredFirstName ?? null, pronouns: c.pronouns,
        dateOfBirth: birthDate(rng, c.grade), osis: `${OSIS_PREFIX}${osis++}`, googleEmail,
      });
      placements.push({ studentId, grade: c.grade, homeroom: c.homeroom, fixed: c.fixed });
      return studentId;
    });

    family.contacts.forEach((contact, priority) => {
      const contactId = rng.uuid();
      let userId: string | null = null;
      if (contact.portalAccess && contact.email) {
        userId = rng.uuid();
        familyUsers.push({
          id: userId, ...by, kind: "family", email: contact.email,
          displayName: `${contact.firstName} ${contact.lastName}`,
        });
      }
      contactRows.push({
        id: contactId, ...by, userId, firstName: contact.firstName, lastName: contact.lastName,
        email: contact.email, phonePrimary: phone(rng), phoneSecondary: rng.chance(0.3) ? phone(rng) : null,
        language: contact.language, preferredChannel: contact.email && rng.chance(0.4) ? "email" : "phone",
      });
      for (const studentId of studentIds) {
        const guardian = GUARDIAN_RELATIONSHIPS.has(contact.relationship);
        linkRows.push({
          id: rng.uuid(), ...by, studentId, contactId, relationship: contact.relationship,
          isGuardian: guardian, livesWith: priority === 0 || guardian, pickupAllowed: guardian || rng.chance(0.5),
          contactPriority: priority + 1, portalAccess: contact.portalAccess, startsOn: ctx.yearStartsOn,
        });
      }
    });
  }

  // A few generated students withdrew in October, so history views have something to show.
  const withdrawn = new Set(
    rng.shuffle(placements.filter((p) => !p.fixed)).slice(0, WITHDRAWN_COUNT).map((p) => p.studentId),
  );
  for (const placement of placements) {
    const left = withdrawn.has(placement.studentId);
    if (left) placement.withdrawnOn = WITHDRAWN_ON;
    enrollmentRows.push({
      id: rng.uuid(), ...by, studentId: placement.studentId, schoolYearId: ctx.schoolYearId,
      gradeLevel: placement.grade, status: left ? "withdrawn" : "active", entryDate: ctx.yearStartsOn,
      exitDate: left ? WITHDRAWN_ON : null,
    });
  }

  return {
    batches: [
      { table: users, rows: [...studentUsers, ...familyUsers] },
      { table: students, rows: studentRows },
      { table: contacts, rows: contactRows },
      { table: studentContacts, rows: linkRows },
      { table: enrollments, rows: enrollmentRows },
    ],
    placements,
  };
}
