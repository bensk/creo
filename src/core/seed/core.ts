import { STAFF_ROLES, type StaffRole } from "../db/columns";
import { roleGroupMappings, staff, staffRoles } from "../auth/schema";
import { schools, users } from "../identity/schema";
import { schoolYears } from "../school/schema";
import { emailSlug, HOMEROOMS, MEN_NAMES, SURNAMES, WOMEN_NAMES } from "./names";
import { STAFF_PERSONAS, type StaffPersona } from "./personas";
import type { Rng } from "./random";
import { GRADES, type SeedBatch, type SeedContext, type SeedStaff } from "./types";

export const SCHOOL_YEAR = { label: "2026–27", startsOn: "2026-09-08", endsOn: "2027-06-25" };
const ROLES_START = "2026-07-01";

/** Google Groups that grant each role. Synthetic addresses. */
export const ROLE_GROUPS: Readonly<Record<StaffRole, string>> = {
  admin: "sis-admins@creoprep.org",
  leader: "leadership@creoprep.org",
  ops: "operations@creoprep.org",
  teacher: "teachers@creoprep.org",
  support: "student-support@creoprep.org",
  coach: "coaches@creoprep.org",
};

const SUBJECTS = ["Math", "ELA", "Science", "Social Studies"] as const;

type StaffSpec = Omit<StaffPersona, "key" | "label" | "kind"> & { personaKey?: string };

function generatedStaff(rng: Rng): StaffSpec[] {
  const person = () => ({
    givenName: rng.pick(rng.chance(0.6) ? WOMEN_NAMES : MEN_NAMES),
    familyName: rng.pick(SURNAMES),
  });
  const specs: StaffSpec[] = [];
  const taken = new Set(STAFF_PERSONAS.flatMap((p) => (p.homeroom ? [p.homeroom] : [])));
  const leadTaken = new Set(STAFF_PERSONAS.flatMap((p) => (p.gradeTeam?.lead ? [p.gradeTeam.grade] : [])));

  for (const grade of GRADES) {
    HOMEROOMS[grade].forEach((homeroom, i) => {
      if (taken.has(homeroom)) return;
      const lead = !leadTaken.has(grade);
      leadTaken.add(grade);
      specs.push({
        ...person(),
        title: `${grade}th Grade ${SUBJECTS[i % SUBJECTS.length]} Teacher`,
        roles: [{ role: "teacher", source: "directory" }],
        homeroom,
        gradeTeam: { grade, lead },
      });
    });
  }
  specs.push(
    { ...person(), title: "Assistant Principal", roles: [{ role: "leader", source: "directory" }] },
    { ...person(), title: "Operations Associate", roles: [{ role: "ops", source: "directory" }] },
    { ...person(), title: "Special Education Coordinator", roles: [{ role: "support", source: "directory" }] },
    { ...person(), title: "ELL Teacher", roles: [{ role: "support", source: "directory" }] },
  );
  return specs;
}

export function buildCoreSeed(rng: Rng): { batches: SeedBatch[]; context: SeedContext } {
  const schoolId = rng.uuid();
  const systemUserId = rng.uuid();
  const schoolYearId = rng.uuid();
  const by = { schoolId, createdBy: systemUserId };

  const staffUsers: Record<string, unknown>[] = [];
  const staffRows: Record<string, unknown>[] = [];
  const roleRows: Record<string, unknown>[] = [];
  const seedStaff: SeedStaff[] = [];
  const emails = new Set<string>();

  const specs: StaffSpec[] = [
    ...STAFF_PERSONAS.map((persona) => ({ ...persona, personaKey: persona.key })),
    ...generatedStaff(rng),
  ];

  for (const spec of specs) {
    let local = emailSlug(spec.givenName, spec.familyName);
    for (let n = 2; emails.has(local); n++) local = `${emailSlug(spec.givenName, spec.familyName)}${n}`;
    emails.add(local);
    const email = `${local}@creoprep.org`;
    const userId = rng.uuid();
    const staffId = rng.uuid();

    staffUsers.push({ id: userId, ...by, kind: "staff", email, displayName: `${spec.givenName} ${spec.familyName}` });
    staffRows.push({
      id: staffId, ...by, userId, email, givenName: spec.givenName, familyName: spec.familyName,
      title: spec.title, orgUnitPath: "/Staff",
    });
    for (const { role, source } of spec.roles) {
      roleRows.push({
        id: rng.uuid(), ...by, staffId, role, source,
        sourceGroupEmail: source === "directory" ? ROLE_GROUPS[role] : null,
        startsOn: ROLES_START,
      });
    }
    seedStaff.push({ id: staffId, personaKey: spec.personaKey, homeroom: spec.homeroom, gradeTeam: spec.gradeTeam });
  }

  const batches: SeedBatch[] = [
    { table: schools, rows: [{ id: schoolId, name: "Creo College Prep", dbn: "84X612" }] },
    // The system user creates itself, then everything else.
    { table: users, rows: [{ id: systemUserId, ...by, kind: "system", displayName: "Seed data" }] },
    { table: users, rows: staffUsers },
    { table: staff, rows: staffRows },
    { table: staffRoles, rows: roleRows },
    {
      table: roleGroupMappings,
      rows: STAFF_ROLES.map((role) => ({ id: rng.uuid(), ...by, googleGroupEmail: ROLE_GROUPS[role], role })),
    },
    { table: schoolYears, rows: [{ id: schoolYearId, ...by, ...SCHOOL_YEAR }] },
  ];

  return {
    batches,
    context: { rng, schoolId, systemUserId, schoolYearId, yearStartsOn: SCHOOL_YEAR.startsOn, staff: seedStaff },
  };
}
