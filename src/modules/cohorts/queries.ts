import { and, eq, inArray, sql } from "drizzle-orm";
import { currentOn } from "@/core/db/dates";
import type { Db } from "@/core/db/types";
import { schools } from "@/core/identity/schema";
import { groupMemberships, groups, groupStaff } from "./schema";

// Public queries other modules and core may use. Nothing outside this module
// reads its tables directly.

/**
 * Whether a staff member currently works with a student: the student is
 * currently in a group (homeroom, grade team, ...) the staff member currently
 * staffs. Drives teachers' access to sensitive fields for assigned students.
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
  return Boolean(row);
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
