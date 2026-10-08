import type { StaffRole } from "../db/columns";

// Fixed test users, one for every role plus the "should be refused" cases. Dev
// sign-in lists these. Every other seeded person is generated.

export interface StaffPersona {
  key: string;
  label: string;
  kind: "staff";
  givenName: string;
  familyName: string;
  title: string;
  roles: readonly { role: StaffRole; source: "directory" | "manual" }[];
  /** Homeroom this person teaches, if any. */
  homeroom?: string;
  /** Grade team they belong to, and whether they lead it. */
  gradeTeam?: { grade: 5 | 6 | 7 | 8; lead: boolean };
}

export interface StudentPersona {
  key: string;
  label: string;
  kind: "student";
  firstName: string;
  preferredFirstName?: string;
  lastName: string;
  pronouns: string;
  grade: 5 | 6 | 7 | 8;
  homeroom: string;
}

export interface FamilyPersona {
  key: string;
  label: string;
  kind: "family";
  firstName: string;
  lastName: string;
  email: string;
  language: "en" | "es";
  relationship: string;
  portalAccess: boolean;
}

export type Persona = StaffPersona | StudentPersona | FamilyPersona;

export const STAFF_PERSONAS: readonly StaffPersona[] = [
  {
    key: "admin", label: "Admin", kind: "staff", givenName: "Dana", familyName: "Whitfield",
    title: "SIS Administrator", roles: [{ role: "admin", source: "manual" }],
  },
  {
    key: "leader", label: "Leader (principal)", kind: "staff", givenName: "Marisol", familyName: "Peña",
    title: "Principal", roles: [{ role: "leader", source: "directory" }],
  },
  {
    key: "ops", label: "Ops", kind: "staff", givenName: "Yesenia", familyName: "Cruz",
    title: "Operations Manager", roles: [{ role: "ops", source: "directory" }],
  },
  {
    key: "support", label: "Support (counselor)", kind: "staff", givenName: "Aaliyah", familyName: "Brooks",
    title: "School Counselor", roles: [{ role: "support", source: "directory" }],
  },
  {
    key: "coach", label: "Coach", kind: "staff", givenName: "Daniel", familyName: "Okafor",
    title: "Instructional Coach", roles: [{ role: "coach", source: "directory" }],
  },
  {
    key: "teacher", label: "Teacher (7th grade, Syracuse homeroom)", kind: "staff", givenName: "Jordan",
    familyName: "Reyes", title: "7th Grade Math Teacher", roles: [{ role: "teacher", source: "directory" }],
    homeroom: "Syracuse", gradeTeam: { grade: 7, lead: false },
  },
  {
    key: "grade-lead", label: "Teacher + 7th grade team lead (NCA&T homeroom)", kind: "staff",
    givenName: "Tanisha", familyName: "Morgan", title: "7th Grade ELA Teacher",
    roles: [{ role: "teacher", source: "directory" }], homeroom: "NCA&T", gradeTeam: { grade: 7, lead: true },
  },
  {
    key: "multi-role", label: "Teacher + support (dean)", kind: "staff", givenName: "Luis", familyName: "Almonte",
    title: "Dean of Students",
    roles: [{ role: "teacher", source: "directory" }, { role: "support", source: "manual" }],
  },
  {
    key: "staff-parent", label: "Teacher who is also a Creo parent", kind: "staff", givenName: "Gabriela",
    familyName: "Santos", title: "6th Grade Science Teacher", roles: [{ role: "teacher", source: "directory" }],
    homeroom: "Howard", gradeTeam: { grade: 6, lead: false },
  },
  {
    key: "no-role", label: "Staff with no role (should see no access)", kind: "staff", givenName: "Chris",
    familyName: "Lindqvist", title: "Substitute Teacher", roles: [],
  },
];

export const STUDENT_PERSONA: StudentPersona = {
  key: "student", label: "Student (7th grade, Syracuse)", kind: "student", firstName: "Camila",
  preferredFirstName: "Cami", lastName: "Martinez", pronouns: "she/her", grade: 7, homeroom: "Syracuse",
};

/** The student persona's younger brother, so the family persona has two children. */
export const SIBLING_STUDENT = {
  firstName: "Mateo", lastName: "Martinez", pronouns: "he/him", grade: 5 as const, homeroom: "Bloomfield",
};

export const FAMILY_PERSONAS: readonly FamilyPersona[] = [
  {
    key: "family", label: "Family (Spanish, two children)", kind: "family", firstName: "Rosa",
    lastName: "Martínez", email: "rosa.martinez@example.com", language: "es", relationship: "mother",
    portalAccess: true,
  },
  {
    key: "family-no-portal", label: "Family contact without portal access (should be refused)",
    kind: "family", firstName: "Victor", lastName: "Martínez", email: "victor.martinez@example.net",
    language: "es", relationship: "father", portalAccess: false,
  },
];

/** The staff-parent persona's personal email as a family contact. */
export const STAFF_PARENT_CONTACT_EMAIL = "gabriela.santos.home@example.com";

export const ALL_PERSONAS: readonly Persona[] = [...STAFF_PERSONAS, STUDENT_PERSONA, ...FAMILY_PERSONAS];
