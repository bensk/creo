import { and, eq, inArray } from "drizzle-orm";
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
