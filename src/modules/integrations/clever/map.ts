import { CsvError, parseCsv, type CsvTable } from "@/core/imports/csv";

// Clever SFTP files (https://schools.clever.com/files/clever-sftp.pdf) → plain
// records for the importer. Pure functions: no database, no network. Problems
// are reported by file, line, and column, never with student details.
// Username and Password columns are never read.

export const CLEVER_FILES = ["schools", "students", "teachers", "staff", "sections", "enrollments"] as const;
export type CleverFile = (typeof CLEVER_FILES)[number];

/** Columns the importer needs in each file. Extra columns are ignored. */
const REQUIRED: Record<CleverFile, string[]> = {
  schools: ["School_id", "School_name"],
  students: ["School_id", "Student_id", "State_id", "Last_name", "First_name", "Grade", "Dob"],
  teachers: ["School_id", "Teacher_id", "Teacher_email", "First_name", "Last_name"],
  staff: ["School_id", "Staff_id", "Staff_email"],
  sections: ["School_id", "Section_id", "Teacher_id", "Name"],
  enrollments: ["School_id", "Section_id", "Student_id"],
};

export interface CleverContact {
  firstName: string;
  lastName: string;
  relationship: string;
  isGuardian: boolean;
  phone: string | null;
  email: string | null;
}

export interface CleverStudent {
  line: number;
  cleverId: string;
  osis: string;
  legalFirstName: string;
  legalLastName: string;
  dateOfBirth: string | null;
  grade: number;
  gender: "F" | "M" | "X" | null;
  ethnicity: string[];
  homeAddress: string | null;
  ell: boolean | null;
  iep: boolean | null;
  contacts: CleverContact[];
}

export interface CleverSection {
  line: number;
  cleverId: string;
  name: string;
  sectionNumber: string | null;
  period: string | null;
  grade: number | null;
  course: { name: string; number: string | null; description: string | null; subject: string | null } | null;
  termName: string | null;
  termStartsOn: string | null;
  termEndsOn: string | null;
  /** Clever teacher IDs, primary first. */
  teacherIds: string[];
}

export interface CleverData {
  schoolIds: string[];
  students: CleverStudent[];
  /** Clever teacher ID → email (teachers.csv and staff.csv). */
  teacherEmails: Map<string, string>;
  sections: CleverSection[];
  /** Section ID → student IDs. */
  enrollments: Map<string, string[]>;
  problems: string[];
  droppedStaffEmails: number;
}

// The same wording the Big Data Tracker uses, so filters work across sources.
const RACE: Record<string, string> = {
  A: "Asian", B: "Black or African American", I: "American Indian or Alaska Native", M: "Two or more races",
  P: "Native Hawaiian or Pacific Islander", W: "Caucasian",
};
const GUARDIAN_TYPES = new Set(["guardian", "parent/guardian", "parent", "primary", "secondary"]);

const blank = (v: string | undefined) => (v ?? "").trim() || null;
const yn = (v: string | undefined) => (/^y(es)?$/i.test(v ?? "") ? true : /^no?$/i.test(v ?? "") ? false : null);

export function cleverDate(v: string | undefined): string | null | "invalid" {
  const s = blank(v);
  if (!s) return null;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = m ? `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}` : (m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)) ? s : null;
  if (!iso) return "invalid";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? "invalid" : iso;
}

export function cleverPhone(v: string | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return blank(v);
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const s = full.trim().replace(/\s+/g, " ");
  if (s.includes(",")) {
    const [last, first] = s.split(",", 2);
    return { firstName: (first ?? "").trim(), lastName: (last ?? "").trim() };
  }
  const parts = s.split(" ");
  if (parts.length === 1) return { firstName: s, lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

function grade(v: string | undefined): number | null {
  const n = Number.parseInt((v ?? "").trim(), 10);
  return Number.isInteger(n) && n >= 5 && n <= 8 ? n : null;
}

/** Reads the six files (by name) into records. Throws only if a file is missing or unreadable. */
export function readCleverFiles(files: Partial<Record<CleverFile, string>>): CleverData {
  const tables = {} as Record<CleverFile, CsvTable>;
  for (const name of CLEVER_FILES) {
    const text = files[name];
    if (text === undefined) throw new CsvError(`${name}.csv is missing`);
    let table: CsvTable;
    try {
      table = parseCsv(text);
    } catch (error) {
      throw new CsvError(`${name}.csv: ${error instanceof Error ? error.message : "can't be read"}`);
    }
    const missing = REQUIRED[name].filter((h) => !table.headers.includes(h));
    if (missing.length) throw new CsvError(`${name}.csv is missing columns: ${missing.join(", ")}`);
    tables[name] = table;
  }

  const problems: string[] = [];
  const at = (file: CleverFile, line: number, column: string, what: string) => problems.push(`${file}.csv line ${line}, ${column}: ${what}`);
  let droppedStaffEmails = 0;

  // students.csv has one row per contact; rows for one student share Student_id.
  const byId = new Map<string, CleverStudent>();
  const invalid = new Set<string>();
  for (const { line, values: v } of tables.students.rows) {
    const id = blank(v.Student_id);
    if (!id) {
      at("students", line, "Student_id", "empty");
      continue;
    }
    if (invalid.has(id)) continue;
    let student = byId.get(id);
    if (!student) {
      const osisDigits = (v.State_id ?? "").replace(/\D/g, "");
      const osis = osisDigits ? osisDigits.padStart(9, "0") : "";
      const dob = cleverDate(v.Dob);
      const g = grade(v.Grade);
      const first = blank(v.First_name);
      const last = blank(v.Last_name);
      const bad = [
        !/^\d{9}$/.test(osis) && ["State_id", "not a 9-digit OSIS"],
        dob === "invalid" && ["Dob", "not a date (MM/DD/YYYY)"],
        g === null && ["Grade", "not a grade from 5 to 8"],
        !first && ["First_name", "empty"],
        !last && ["Last_name", "empty"],
      ].filter(Boolean) as [string, string][];
      if (bad.length) {
        for (const [col, what] of bad) at("students", line, col, what);
        invalid.add(id);
        continue;
      }
      const races = (v.Race ?? "").split(/[,;\s]+/).map((r) => RACE[r.toUpperCase()]).filter((r): r is string => Boolean(r));
      const address = [v.Student_street, v.Student_city, [v.Student_state, v.Student_zip].map((x) => blank(x)).filter(Boolean).join(" ")]
        .map((x) => blank(x ?? undefined)).filter(Boolean).join(", ");
      const gender = (v.Gender ?? "").trim().toUpperCase();
      student = {
        line, cleverId: id, osis, legalFirstName: first!, legalLastName: last!, dateOfBirth: dob as string | null, grade: g!,
        gender: gender === "F" || gender === "M" || gender === "X" ? gender : null,
        ethnicity: [...(yn(v.Hispanic_Latino) ? ["Hispanic/Latino"] : []), ...races],
        homeAddress: address || null, ell: yn(v.Ell_status), iep: yn(v.Iep_status), contacts: [],
      };
      byId.set(id, student);
    }
    const contactName = blank(v.Contact_name);
    if (contactName) {
      const type = (v.Contact_type ?? "").trim().toLowerCase();
      let email = blank(v.Contact_email)?.toLowerCase() ?? null;
      // Staff who are Creo parents use a personal email on the family side.
      if (email?.endsWith("@creoprep.org")) {
        email = null;
        droppedStaffEmails++;
      }
      const name = splitName(contactName);
      if (!student.contacts.some((c) => c.firstName === name.firstName && c.lastName === name.lastName)) {
        student.contacts.push({
          ...name, relationship: blank(v.Contact_relationship) ?? blank(v.Contact_type) ?? "Contact",
          isGuardian: GUARDIAN_TYPES.has(type), phone: cleverPhone(v.Contact_phone), email,
        });
      }
    }
  }

  // Two Clever students with the same OSIS would merge into one: skip both.
  const byOsis = new Map<string, CleverStudent[]>();
  for (const s of byId.values()) byOsis.set(s.osis, [...(byOsis.get(s.osis) ?? []), s]);
  for (const group of byOsis.values()) {
    if (group.length < 2) continue;
    for (const s of group) {
      at("students", s.line, "State_id", `same OSIS as line ${group.filter((o) => o !== s).map((o) => o.line).join(", ")}`);
      byId.delete(s.cleverId);
    }
  }

  const teacherEmails = new Map<string, string>();
  for (const { values: v } of tables.teachers.rows) {
    const id = blank(v.Teacher_id);
    const email = blank(v.Teacher_email)?.toLowerCase();
    if (id && email) teacherEmails.set(id, email);
  }
  for (const { values: v } of tables.staff.rows) {
    const id = blank(v.Staff_id);
    const email = blank(v.Staff_email)?.toLowerCase();
    if (id && email && !teacherEmails.has(id)) teacherEmails.set(id, email);
  }

  const sections: CleverSection[] = [];
  for (const { line, values: v } of tables.sections.rows) {
    const id = blank(v.Section_id);
    if (!id) {
      at("sections", line, "Section_id", "empty");
      continue;
    }
    const start = cleverDate(v.Term_start);
    const end = cleverDate(v.Term_end);
    const courseName = blank(v.Course_name);
    const teacherIds = ["Teacher_id", ...Array.from({ length: 9 }, (_, k) => `Teacher_${k + 2}_id`)]
      .map((h) => blank(v[h])).filter((t): t is string => Boolean(t));
    sections.push({
      line, cleverId: id, name: blank(v.Name) ?? courseName ?? `Section ${id}`, sectionNumber: blank(v.Section_number),
      period: blank(v.Period), grade: grade(v.Grade),
      course: courseName ? { name: courseName, number: blank(v.Course_number), description: blank(v.Course_description), subject: blank(v.Subject) } : null,
      termName: blank(v.Term_name), termStartsOn: start === "invalid" ? null : start, termEndsOn: end === "invalid" ? null : end,
      teacherIds: [...new Set(teacherIds)],
    });
    if (start === "invalid") at("sections", line, "Term_start", "not a date");
    if (end === "invalid") at("sections", line, "Term_end", "not a date");
  }

  const enrollments = new Map<string, string[]>();
  for (const { values: v } of tables.enrollments.rows) {
    const section = blank(v.Section_id);
    const student = blank(v.Student_id);
    if (!section || !student) continue;
    enrollments.set(section, [...new Set([...(enrollments.get(section) ?? []), student])]);
  }

  const schoolIds = [...new Set(tables.schools.rows.map((r) => blank(r.values.School_id)).filter((x): x is string => Boolean(x)))];
  return { schoolIds, students: [...byId.values()], teacherEmails, sections, enrollments, problems, droppedStaffEmails };
}

/**
 * Whether a section is a homeroom, and which. A section counts when its course
 * or name says "homeroom", or when it has no course and its name, without the
 * grade, is a homeroom the SIS already has (e.g. "7 - Syracuse"). A class such
 * as "Math - Syracuse" is not a homeroom. The homeroom name is the existing one
 * the section names, or the section name without "homeroom", the grade, and
 * separators.
 */
export function homeroomFor(section: Pick<CleverSection, "name" | "course">, existing: readonly string[]): string | null {
  const strip = (text: string) =>
    text
      .replace(/home\s*room/gi, "")
      .replace(/\b(grade\s*)?[5-8](th)?(\s*grade)?\b/gi, "")
      .replace(/\(.*?\)/g, "")
      .replace(/[-–—:|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const saysHomeroom = /home\s*room/i.test(section.name) || /home\s*room/i.test(section.course?.name ?? "");
  const cleaned = strip(section.name);
  const exact = existing.find((h) => h.toLowerCase() === cleaned.toLowerCase());
  if (!saysHomeroom) return !section.course && exact ? exact : null;
  const named = existing.find((h) => new RegExp(`(^|[^a-z])${h.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}([^a-z]|$)`, "i").test(section.name));
  return exact ?? named ?? (cleaned || null);
}
