import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { staff } from "@/core/auth/schema";
import { currentOn, schoolToday } from "@/core/db/dates";
import type { Db } from "@/core/db/types";
import { schools } from "@/core/identity/schema";
import { schoolYears } from "@/core/school/schema";
import { courses, groupMemberships, groups, groupStaff, sectionEnrollments, sections, sectionStaff } from "./schema";

// Public queries other modules and core may use. Nothing outside this module
// reads its tables directly.

/**
 * Whether a staff member currently works with a student: the student is
 * currently in a group (homeroom, grade team, ...) or a section the staff
 * member currently staffs or teaches. Drives teachers' access to sensitive
 * fields for assigned students.
 */
export async function isStaffAssignedToStudent(db: Db, staffId: string, studentId: string): Promise<boolean> {
  const staffed = db
    .select({ groupId: groupStaff.groupId })
    .from(groupStaff)
    .innerJoin(schools, eq(schools.id, groupStaff.schoolId))
    .where(and(eq(groupStaff.staffId, staffId), currentOn(groupStaff.startsOn, groupStaff.endsOn)));
  const [row] = await db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .innerJoin(schools, eq(schools.id, groupMemberships.schoolId))
    .where(
      and(
        eq(groupMemberships.studentId, studentId),
        inArray(groupMemberships.groupId, staffed),
        currentOn(groupMemberships.startsOn, groupMemberships.endsOn),
      ),
    )
    .limit(1);
  if (row) return true;
  const taught = db
    .select({ sectionId: sectionStaff.sectionId })
    .from(sectionStaff)
    .innerJoin(schools, eq(schools.id, sectionStaff.schoolId))
    .where(and(eq(sectionStaff.staffId, staffId), currentOn(sectionStaff.startsOn, sectionStaff.endsOn)));
  const [inSection] = await db
    .select({ id: sectionEnrollments.id })
    .from(sectionEnrollments)
    .innerJoin(schools, eq(schools.id, sectionEnrollments.schoolId))
    .where(
      and(
        eq(sectionEnrollments.studentId, studentId),
        inArray(sectionEnrollments.sectionId, taught),
        currentOn(sectionEnrollments.startsOn, sectionEnrollments.endsOn),
      ),
    )
    .limit(1);
  return Boolean(inSection);
}

/** Whether a staff member is currently the homeroom teacher of the student's current homeroom. */
export async function isHomeroomTeacherOf(db: Db, staffId: string, studentId: string): Promise<boolean> {
  const homerooms = db
    .select({ groupId: groupStaff.groupId })
    .from(groupStaff)
    .innerJoin(schools, eq(schools.id, groupStaff.schoolId))
    .innerJoin(groups, eq(groups.id, groupStaff.groupId))
    .where(
      and(
        eq(groupStaff.staffId, staffId),
        eq(groupStaff.function, "homeroom_teacher"),
        eq(groups.type, "homeroom"),
        currentOn(groupStaff.startsOn, groupStaff.endsOn),
      ),
    );
  const [row] = await db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .innerJoin(schools, eq(schools.id, groupMemberships.schoolId))
    .where(
      and(
        eq(groupMemberships.studentId, studentId),
        inArray(groupMemberships.groupId, homerooms),
        currentOn(groupMemberships.startsOn, groupMemberships.endsOn),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** The groups a staff member currently works with, and how many students are in each today. */
export async function groupsForStaff(db: Db, staffId: string) {
  // Outer columns named explicitly; see the note in students/queries.ts.
  const memberCount = sql<number>`(
    select count(*)::int from group_memberships gm
    where gm.group_id = "groups"."id"
      and gm.starts_on <= (now() at time zone "schools"."timezone")::date
      and (gm.ends_on is null or gm.ends_on >= (now() at time zone "schools"."timezone")::date)
  )`;
  return db
    .select({
      id: groups.id, name: groups.name, type: groups.type, gradeLevel: groups.gradeLevel,
      function: groupStaff.function, students: memberCount,
    })
    .from(groupStaff)
    .innerJoin(groups, eq(groups.id, groupStaff.groupId))
    .innerJoin(schools, eq(schools.id, groupStaff.schoolId))
    .where(and(eq(groupStaff.staffId, staffId), currentOn(groupStaff.startsOn, groupStaff.endsOn)))
    .orderBy(groups.type, groups.name);
}

/** Each student's current homeroom name. */
export async function currentHomerooms(db: Db, studentIds: readonly string[]): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const rows = await db
    .select({ studentId: groupMemberships.studentId, name: groups.name })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .innerJoin(schools, eq(schools.id, groupMemberships.schoolId))
    .where(
      and(
        inArray(groupMemberships.studentId, [...studentIds]),
        eq(groups.type, "homeroom"),
        currentOn(groupMemberships.startsOn, groupMemberships.endsOn),
      ),
    );
  return new Map(rows.map((r) => [r.studentId, r.name]));
}

/** Every group membership a student has had, with dates. Current ones first. */
export async function membershipsForStudent(db: Db, studentId: string) {
  const current = sql<boolean>`(${groupMemberships.endsOn} is null or ${groupMemberships.endsOn} >= (now() at time zone "schools"."timezone")::date)`;
  return db
    .select({
      id: groupMemberships.id, groupId: groups.id, name: groups.name, type: groups.type, gradeLevel: groups.gradeLevel,
      startsOn: groupMemberships.startsOn, endsOn: groupMemberships.endsOn, current,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .innerJoin(schools, eq(schools.id, groupMemberships.schoolId))
    .where(eq(groupMemberships.studentId, studentId))
    .orderBy(sql`${current} desc`, groups.type, sql`${groupMemberships.startsOn} desc`);
}

export const IMPORT_MANAGED_GROUP_TYPES = ["homeroom", "grade_team"] as const;

/** This year's groups (archived last), with current student and staff counts. */
export async function listGroups(db: Db, schoolId: string) {
  return db
    .select({
      id: groups.id, name: groups.name, type: groups.type, gradeLevel: groups.gradeLevel, archivedAt: groups.archivedAt,
      students: sql<number>`(select count(*)::int from group_memberships gm where gm.group_id = "groups"."id"
        and gm.starts_on <= ${schoolToday} and (gm.ends_on is null or gm.ends_on >= ${schoolToday}))`,
      staffNames: sql<string[]>`coalesce((select array_agg(coalesce(st.preferred_name, st.given_name) || ' ' || st.family_name order by gs.function, st.family_name)
        from group_staff gs join staff st on st.id = gs.staff_id where gs.group_id = "groups"."id"
        and gs.starts_on <= ${schoolToday} and (gs.ends_on is null or gs.ends_on >= ${schoolToday})), '{}')`,
    })
    .from(groups)
    .innerJoin(schools, eq(schools.id, groups.schoolId))
    .innerJoin(schoolYears, eq(schoolYears.id, groups.schoolYearId))
    .where(and(eq(groups.schoolId, schoolId), sql`${schoolToday} between ${schoolYears.startsOn} and ${schoolYears.endsOn}`))
    .orderBy(sql`${groups.archivedAt} is not null`, groups.type, groups.gradeLevel, groups.name);
}

export async function getGroup(db: Db, schoolId: string, groupId: string) {
  const [row] = await db.select().from(groups).where(and(eq(groups.schoolId, schoolId), eq(groups.id, groupId)));
  return row ?? null;
}

/** A group's memberships (current, or every one it ever had). Names come from the students module's rosterFor. */
export async function groupMembers(db: Db, groupId: string, options: { includePast?: boolean } = {}) {
  const current = sql<boolean>`(${groupMemberships.startsOn} <= ${schoolToday} and (${groupMemberships.endsOn} is null or ${groupMemberships.endsOn} >= ${schoolToday}))`;
  return db
    .select({ membershipId: groupMemberships.id, studentId: groupMemberships.studentId, startsOn: groupMemberships.startsOn, endsOn: groupMemberships.endsOn, current })
    .from(groupMemberships)
    .innerJoin(schools, eq(schools.id, groupMemberships.schoolId))
    .where(and(eq(groupMemberships.groupId, groupId), ...(options.includePast ? [] : [current])))
    .orderBy(sql`${current} desc`, sql`${groupMemberships.endsOn} desc nulls first`);
}

/** A group's current staff. */
export async function groupStaffMembers(db: Db, groupId: string) {
  return db
    .select({
      id: groupStaff.id, staffId: staff.id, function: groupStaff.function, startsOn: groupStaff.startsOn,
      name: sql<string>`coalesce(${staff.preferredName}, ${staff.givenName}) || ' ' || ${staff.familyName}`,
    })
    .from(groupStaff)
    .innerJoin(staff, eq(staff.id, groupStaff.staffId))
    .innerJoin(schools, eq(schools.id, groupStaff.schoolId))
    .where(and(eq(groupStaff.groupId, groupId), currentOn(groupStaff.startsOn, groupStaff.endsOn)))
    .orderBy(groupStaff.function, staff.familyName);
}

/** This year's classes (sections), with course, period, teachers, and current student count. */
export async function listSections(db: Db, schoolId: string, options: { staffId?: string } = {}) {
  const taughtBy = options.staffId
    ? [sql`exists (select 1 from section_staff ss where ss.section_id = "sections"."id" and ss.staff_id = ${options.staffId}
        and ss.starts_on <= ${schoolToday} and (ss.ends_on is null or ss.ends_on >= ${schoolToday}))`]
    : [];
  return db
    .select({
      id: sections.id, name: sections.name, period: sections.period, gradeLevel: sections.gradeLevel, courseName: courses.name,
      students: sql<number>`(select count(*)::int from section_enrollments se where se.section_id = "sections"."id"
        and se.starts_on <= ${schoolToday} and (se.ends_on is null or se.ends_on >= ${schoolToday}))`,
      teacherNames: sql<string[]>`coalesce((select array_agg(coalesce(st.preferred_name, st.given_name) || ' ' || st.family_name order by ss.role desc, st.family_name)
        from section_staff ss join staff st on st.id = ss.staff_id where ss.section_id = "sections"."id"
        and ss.starts_on <= ${schoolToday} and (ss.ends_on is null or ss.ends_on >= ${schoolToday})), '{}')`,
    })
    .from(sections)
    .leftJoin(courses, eq(courses.id, sections.courseId))
    .innerJoin(schools, eq(schools.id, sections.schoolId))
    .innerJoin(schoolYears, eq(schoolYears.id, sections.schoolYearId))
    .where(and(
      eq(sections.schoolId, schoolId), isNull(sections.archivedAt),
      sql`${schoolToday} between ${schoolYears.startsOn} and ${schoolYears.endsOn}`, ...taughtBy,
    ))
    .orderBy(sections.gradeLevel, sections.period, sections.name);
}

export async function getSection(db: Db, schoolId: string, sectionId: string) {
  const [row] = await db
    .select({
      id: sections.id, name: sections.name, period: sections.period, gradeLevel: sections.gradeLevel, termName: sections.termName,
      archivedAt: sections.archivedAt, courseName: courses.name, courseNumber: courses.number,
    })
    .from(sections)
    .leftJoin(courses, eq(courses.id, sections.courseId))
    .where(and(eq(sections.schoolId, schoolId), eq(sections.id, sectionId)));
  return row ?? null;
}

export async function sectionMembers(db: Db, sectionId: string) {
  return db
    .select({ studentId: sectionEnrollments.studentId, startsOn: sectionEnrollments.startsOn })
    .from(sectionEnrollments)
    .innerJoin(schools, eq(schools.id, sectionEnrollments.schoolId))
    .where(and(eq(sectionEnrollments.sectionId, sectionId), currentOn(sectionEnrollments.startsOn, sectionEnrollments.endsOn)));
}

export async function sectionTeachers(db: Db, sectionId: string) {
  return db
    .select({ staffId: staff.id, role: sectionStaff.role, name: sql<string>`coalesce(${staff.preferredName}, ${staff.givenName}) || ' ' || ${staff.familyName}` })
    .from(sectionStaff)
    .innerJoin(staff, eq(staff.id, sectionStaff.staffId))
    .innerJoin(schools, eq(schools.id, sectionStaff.schoolId))
    .where(and(eq(sectionStaff.sectionId, sectionId), currentOn(sectionStaff.startsOn, sectionStaff.endsOn)))
    .orderBy(sql`${sectionStaff.role} = 'co_teacher'`, staff.familyName);
}

/** Active staff, for choosing who works with a group. */
export async function activeStaff(db: Db, schoolId: string) {
  return db
    .select({ id: staff.id, name: sql<string>`coalesce(${staff.preferredName}, ${staff.givenName}) || ' ' || ${staff.familyName}` })
    .from(staff)
    .where(and(eq(staff.schoolId, schoolId), eq(staff.status, "active")))
    .orderBy(staff.familyName, staff.givenName);
}
