import type { NotionPage, NotionValue } from "../notion/client";

// Maps one "26-27 Big Data Tracker" row to what the SIS stores today. Columns
// without a home in the approved schema (address, demographics, health, scores,
// periods, flags, paperwork checkboxes) are deliberately not read.
//
// Errors name the row number and column, never a student's details.

export type Grade = 5 | 6 | 7 | 8;

export interface BdtContact {
  /** Stable within a student: "guardian1", "guardian2", "emergency". */
  slot: "guardian1" | "guardian2" | "emergency";
  firstName: string;
  lastName: string;
  relationship: string;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  email: string | null;
  isGuardian: boolean;
}

export interface BdtStudent {
  pageId: string;
  legalFirstName: string;
  legalLastName: string;
  osis: string | null;
  dateOfBirth: string | null;
  grade: Grade;
  homeroom: { name: string; grade: Grade; ict: boolean } | null;
  entryDate: string | null;
  withdrawn: boolean;
  contacts: BdtContact[];
  /** From the IEP column. "evaluation" = no IEP, family interested in an evaluation (not stored as a support). */
  support: { type: "iep" | "504"; details: string | null } | null;
  accommodations: string[];
  mediaConsent: "no" | "ask_first" | null;
  health: BdtHealth | null;
  demographics: BdtDemographics | null;
  /** Guardian emails we couldn't store (creoprep.org addresses), counted for ops. */
  droppedStaffEmails: number;
}

export type FormStatus = "received" | "missing" | "not_needed";
export type VisitStatus = "received" | "appointment_scheduled" | "missing";

export interface BdtHealth {
  hasAllergies: boolean | null;
  allergyDetails: string | null;
  epipen: boolean;
  allergyMedication: boolean;
  foodRestrictions: boolean | null;
  lunchAccommodations: string[];
  allergyForm: FormStatus | null;
  asthmaForm: FormStatus | null;
  generalForm: FormStatus | null;
  immunizationStatus: VisitStatus | null;
  immunizationDate: string | null;
  physicalStatus: VisitStatus | null;
  physicalDate: string | null;
}

export interface BdtDemographics {
  gender: "F" | "M" | "X" | null;
  ethnicity: string[];
  homeAddress: string | null;
  mealFormStatus: "received" | "missing" | null;
}

/** "Recieved" (as the tracker spells it) / "Received" → received; "Missing …" → missing; "N/A" → not needed. */
export function formStatus(value: string | null): FormStatus | null {
  if (!value) return null;
  if (/^rec(ie|ei)ved$/i.test(value.trim())) return "received";
  if (/^missing/i.test(value.trim())) return "missing";
  if (/^n\/?a$/i.test(value.trim())) return "not_needed";
  return null;
}

/** Immunization or physical status from the tracker's checklist; the furthest step wins. ATS entry flags are ignored. */
export function visitStatus(values: string[]): VisitStatus | null {
  if (values.some((v) => /^rec(ie|ei)ved$/i.test(v))) return "received";
  if (values.some((v) => /appt|appointment/i.test(v))) return "appointment_scheduled";
  if (values.some((v) => /^missing/i.test(v))) return "missing";
  return null;
}

export type MapResult = { ok: true; student: BdtStudent } | { ok: false; error: string };

type Value = NotionValue | undefined;
const str = (v: Value): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const list = (v: Value): string[] => (Array.isArray(v) ? v : []);
const dateOf = (v: Value): string | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v.start.slice(0, 10) : null;

/** "7 - Albany Shaniah & Lily", "8 - USC (ICT)" → grade, college, ICT. Teacher names are dropped. */
export function parseHomeroom(label: string | null): { name: string; grade: Grade; ict: boolean } | null {
  if (!label) return null;
  const m = /^\s*([5-8])\s*-\s*(.+?)\s*$/.exec(label);
  if (!m) return null;
  const ict = /\(ICT\)/i.test(m[2]!);
  // Teacher names come as a pair joined by "&" or "/" after the college; drop them.
  const college = m[2]!
    .replace(/\(ICT\)/gi, " ")
    .replace(/\s+[A-Z][\p{L}'-]*\s*[&/]\s*[A-Z][\p{L}'-]*\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return { name: college, grade: Number(m[1]) as Grade, ict };
}

/** "Maria Del Carmen Rodríguez" → first "Maria Del Carmen", last "Rodríguez". */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

const CREO_EMAIL = /@([a-z0-9-]+\.)*creoprep\.org$/i;

export function mapBdtRow(page: NotionPage, rowNumber: number): MapResult {
  const p = page.properties;
  const fail = (column: string, problem: string): MapResult => ({ ok: false, error: `row ${rowNumber}: ${column} ${problem}` });

  const first = str(p["First"]);
  const last = str(p["Last"]);
  if (!first || !last) return fail("First/Last", "is empty");

  const gradeText = str(p["Grade"]);
  const grade = gradeText ? (Number(gradeText) as Grade) : null;
  if (!grade || ![5, 6, 7, 8].includes(grade)) return fail("Grade", "is missing or not 5–8");

  let osis: string | null = null;
  const osisRaw = p["OSIS"];
  if (typeof osisRaw === "number") {
    osis = String(Math.round(osisRaw)).padStart(9, "0");
    if (!/^\d{9}$/.test(osis)) return fail("OSIS", "is not nine digits");
  }

  const homeroom = parseHomeroom(str(p["Homeroom"]));
  if (str(p["Homeroom"]) && !homeroom) return fail("Homeroom", "doesn't look like \"<grade> - <college>\"");
  if (homeroom && homeroom.grade !== grade) return fail("Homeroom", "is for a different grade than Grade");

  let droppedStaffEmails = 0;
  const email = (v: Value) => {
    const e = str(v)?.toLowerCase() ?? null;
    if (e && CREO_EMAIL.test(e)) {
      droppedStaffEmails++;
      return null;
    }
    return e;
  };

  const contacts: BdtContact[] = [];
  const guardian = (slot: "guardian1" | "guardian2", prefix: "Guardian" | "2nd Guardian") => {
    const name = str(p[`${prefix} Name`] ?? (prefix === "2nd Guardian" ? p["Secondary Guardian/Emergency Contact"] : null));
    if (!name) return;
    contacts.push({
      slot, ...splitName(name), relationship: (str(p[`${prefix} Relation`]) ?? "guardian").toLowerCase(),
      phonePrimary: str(p[`${prefix} Phone 1`]), phoneSecondary: str(p[`${prefix} Phone 2`]),
      email: email(p[`${prefix} Email`]), isGuardian: true,
    });
  };
  guardian("guardian1", "Guardian");
  guardian("guardian2", "2nd Guardian");
  const emergencyName = str(p["Emergency Contact Name"]);
  if (emergencyName) {
    contacts.push({
      slot: "emergency", ...splitName(emergencyName),
      relationship: (str(p["Emergency Contact Relation"]) ?? "emergency contact").toLowerCase(),
      phonePrimary: str(p["Emergency Contact Phone"]), phoneSecondary: null, email: null, isGuardian: false,
    });
  }

  const iep = str(p["IEP"]);
  const support =
    iep === "Received" ? { type: "iep" as const, details: null }
    : iep === "Missing IEP" ? { type: "iep" as const, details: "IEP not yet received from the previous school" }
    : iep === "504" ? { type: "504" as const, details: null }
    : null;

  // Health. The "Allergies" and "Asthma" columns hold the family's answers on the
  // enrollment form; "Asthma" is actually the food-restrictions question.
  const allergyAnswers = list(p["Allergies"]);
  const foodAnswers = list(p["Asthma"]);
  const health: BdtHealth = {
    hasAllergies: allergyAnswers.some((a) => /NO known allergies/i.test(a))
      ? false
      : allergyAnswers.some((a) => /has allergies|medication|EpiPen/i.test(a)) ? true : null,
    allergyDetails: str(p["Allergen/Reaction/Treatment"]),
    epipen: allergyAnswers.some((a) => /EpiPen/i.test(a)),
    allergyMedication: allergyAnswers.some((a) => /medication/i.test(a)),
    foodRestrictions: foodAnswers.some((a) => /NO specific food restrictions/i.test(a))
      ? false
      : foodAnswers.some((a) => /following food restrictions/i.test(a)) ? true : null,
    lunchAccommodations: list(p["Lunch Accommodations"]),
    allergyForm: formStatus(str(p["Allergy MAF"])),
    asthmaForm: formStatus(str(p["Asthma MAF"])),
    generalForm: formStatus(str(p["General MAF"])),
    immunizationStatus: visitStatus(list(p["Immunization"])),
    immunizationDate: dateOf(p["Immunization Date"]),
    physicalStatus: visitStatus(list(p["Physical"])),
    physicalDate: dateOf(p["Physical Date"]),
  };
  // An explicit "no" (no known allergies) is information; only all-blank means no health data.
  const hasHealth =
    health.epipen || health.allergyMedication ||
    Object.entries(health).some(([k, v]) => k !== "epipen" && k !== "allergyMedication" && (Array.isArray(v) ? v.length > 0 : v !== null));

  const genderText = str(p["Gender"]);
  const meals = list(p["FRP (meals)"]);
  const demographics: BdtDemographics = {
    gender: genderText === "F" || genderText === "M" || genderText === "X" ? genderText : null,
    ethnicity: list(p["Ethnicity"]),
    homeAddress: str(p["Home Address"]),
    mealFormStatus: meals.some((m) => /^received$/i.test(m)) ? "received" : meals.some((m) => /^missing$/i.test(m)) ? "missing" : null,
  };
  const hasDemographics = Object.values(demographics).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null));

  const consent = str(p["Social Media"]);
  const mediaConsent = consent === "No" ? "no" : consent === "Ask first" ? "ask_first" : null;

  return {
    ok: true,
    student: {
      mediaConsent,
      health: hasHealth ? health : null,
      demographics: hasDemographics ? demographics : null,
      pageId: page.id,
      legalFirstName: first,
      legalLastName: last,
      osis,
      dateOfBirth: dateOf(p["DOB"]),
      grade,
      homeroom,
      entryDate: dateOf(p["Start Date"]),
      withdrawn: str(p["ATS Status"]) === "Withdrawn",
      contacts,
      support,
      accommodations: list(p["Testing Accommodation(s)"]),
      droppedStaffEmails,
    },
  };
}
