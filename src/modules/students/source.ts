import { sql } from "drizzle-orm";
import type { FieldDef, SourceDef } from "@/core/query/source";

// The "students" query source: one row per student enrolled this school year
// (withdrawn students included, with their status). Other modules add fields
// through their manifest's sourceFields. SQL refers to the student as "s" and
// their latest enrollment this year as "e".

const s = (column: string) => sql.raw(`"s"."${column}"`);

export const studentsSource: SourceDef = {
  id: "students",
  label: "Students",
  permission: "students.view",
  rowAlias: "s",
  rowId: sql.raw(`"s"."id"`),
  version: sql.raw(`"s"."version"`),
  from: (ctx) => sql`students s
    join lateral (
      select en.grade_level, en.status, en.entry_date, en.exit_date
      from enrollments en
      join school_years y on y.id = en.school_year_id
      where en.student_id = s.id and ${ctx.today}::date between y.starts_on and y.ends_on
      order by en.entry_date desc
      limit 1
    ) e on true`,
  scope: (ctx) => sql`${s("school_id")} = ${ctx.schoolId}`,
  assigned: (staffId, ctx) => sql`exists (
    select 1 from group_memberships gm
    join group_staff gs on gs.group_id = gm.group_id
    where gm.student_id = s.id and gs.staff_id = ${staffId}
      and gm.starts_on <= ${ctx.today}::date and (gm.ends_on is null or gm.ends_on >= ${ctx.today}::date)
      and gs.starts_on <= ${ctx.today}::date and (gs.ends_on is null or gs.ends_on >= ${ctx.today}::date)
  )`,
  searchFields: ["name", "legalFirstName", "legalLastName"],
  defaultSort: [{ field: "name", dir: "asc" }],
};

const currentSupport = (type: string) => (ctx: { today: string }) =>
  sql`exists (select 1 from student_supports ss where ss.student_id = s.id and ss.type = ${type}
    and ss.starts_on <= ${ctx.today}::date and (ss.ends_on is null or ss.ends_on >= ${ctx.today}::date))`;

export const studentFields: FieldDef[] = [
  {
    key: "name", label: "Name", type: "text", sensitivity: "standard", group: "Student", defaultVisible: true,
    select: () => sql`coalesce(${s("preferred_first_name")}, ${s("legal_first_name")}) || ' ' || coalesce(${s("preferred_last_name")}, ${s("legal_last_name")})`,
    sortBy: () => sql`lower(coalesce(${s("preferred_last_name")}, ${s("legal_last_name")}) || ' ' || coalesce(${s("preferred_first_name")}, ${s("legal_first_name")}))`,
  },
  { key: "phonetic", label: "Pronunciation", type: "text", sensitivity: "standard", group: "Student", defaultVisible: true,
    select: () => sql`(select np.phonetic from name_pronunciations np where np.student_id = s.id order by np.created_at desc limit 1)` },
  { key: "preferredFirstName", label: "Preferred first name", type: "text", sensitivity: "standard", group: "Student", select: () => s("preferred_first_name") },
  { key: "legalFirstName", label: "Legal first name", type: "text", sensitivity: "standard", group: "Student", select: () => s("legal_first_name") },
  { key: "legalLastName", label: "Legal last name", type: "text", sensitivity: "standard", group: "Student", select: () => s("legal_last_name") },
  { key: "pronouns", label: "Pronouns", type: "text", sensitivity: "standard", group: "Student", select: () => s("pronouns") },
  { key: "grade", label: "Grade", type: "number", sensitivity: "standard", group: "Enrollment", defaultVisible: true, select: () => sql`e.grade_level` },
  { key: "status", label: "Enrollment", type: "enum", sensitivity: "standard", group: "Enrollment", defaultVisible: true,
    options: ["active", "withdrawn", "completed"], select: () => sql`e.status` },
  { key: "entryDate", label: "Entry date", type: "date", sensitivity: "standard", group: "Enrollment", select: () => sql`e.entry_date` },
  { key: "medicalAlert", label: "Medical alert", type: "text", sensitivity: "standard", group: "Student", defaultVisible: true, select: () => s("medical_alert") },
  { key: "mediaConsent", label: "Photo consent", type: "enum", sensitivity: "standard", group: "Student",
    options: ["yes", "no", "ask_first"], select: () => s("media_consent") },
  { key: "primaryContact", label: "Primary contact", type: "text", sensitivity: "standard", group: "Family",
    select: () => sql`(select c.first_name || ' ' || c.last_name from student_contacts sc join contacts c on c.id = sc.contact_id
      where sc.student_id = s.id and sc.ends_on is null order by sc.contact_priority nulls last limit 1)` },
  { key: "primaryPhone", label: "Primary phone", type: "text", sensitivity: "standard", group: "Family",
    select: () => sql`(select c.phone_primary from student_contacts sc join contacts c on c.id = sc.contact_id
      where sc.student_id = s.id and sc.ends_on is null order by sc.contact_priority nulls last limit 1)` },
  { key: "familyLanguage", label: "Family language", type: "enum", sensitivity: "standard", group: "Family", options: ["en", "es"],
    select: () => sql`(select c.language from student_contacts sc join contacts c on c.id = sc.contact_id
      where sc.student_id = s.id and sc.ends_on is null order by sc.contact_priority nulls last limit 1)` },
  { key: "osis", label: "OSIS", type: "text", sensitivity: "restricted", group: "Identifiers", select: () => s("osis") },
  { key: "dateOfBirth", label: "Date of birth", type: "date", sensitivity: "restricted", group: "Identifiers", select: () => s("date_of_birth") },
  { key: "gender", label: "Gender", type: "enum", sensitivity: "restricted", group: "Demographics", options: ["F", "M", "X"],
    select: () => sql`(select d.gender from student_demographics d where d.student_id = s.id)` },
  { key: "ethnicity", label: "Ethnicity", type: "text_list", sensitivity: "restricted", group: "Demographics",
    select: () => sql`(select d.ethnicity from student_demographics d where d.student_id = s.id)` },
  { key: "mealForm", label: "Meal form", type: "enum", sensitivity: "restricted", group: "Demographics", options: ["received", "missing"],
    select: () => sql`(select d.meal_form_status from student_demographics d where d.student_id = s.id)` },
  { key: "iep", label: "IEP", type: "boolean", sensitivity: "sensitive", group: "Supports", select: currentSupport("iep") },
  { key: "plan504", label: "504 plan", type: "boolean", sensitivity: "sensitive", group: "Supports", select: currentSupport("504") },
  { key: "ell", label: "English learner", type: "boolean", sensitivity: "sensitive", group: "Supports", select: currentSupport("ell") },
  { key: "hasAllergies", label: "Allergies", type: "boolean", sensitivity: "sensitive", group: "Health",
    select: () => sql`coalesce((select h.has_allergies from student_health h where h.student_id = s.id), false)` },
  { key: "epipen", label: "EpiPen", type: "boolean", sensitivity: "sensitive", group: "Health",
    select: () => sql`coalesce((select h.epipen from student_health h where h.student_id = s.id), false)` },
];
