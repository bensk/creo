import { and, eq } from "drizzle-orm";
import { familyAccessForUser, studentAccessForUser } from "../../modules/students/queries";
import type { StaffRole } from "../db/columns";
import { currentOn } from "../db/dates";
import type { Db } from "../db/types";
import { schools, users } from "../identity/schema";
import { staff, staffRoles } from "./schema";
import type { Surface } from "./surfaces";

interface ViewerBase {
  userId: string;
  schoolId: string;
  displayName: string;
  /** False when the person exists but may not use the app right now (no role, no children, not enrolled). */
  hasAccess: boolean;
}

export interface StaffViewer extends ViewerBase {
  kind: "staff";
  staffId: string;
  roles: StaffRole[];
}

export interface StudentViewer extends ViewerBase {
  kind: "student";
  studentId: string;
}

export interface FamilyViewer extends ViewerBase {
  kind: "family";
  contactId: string;
  language: string;
  /** Children this contact currently has portal access for. */
  studentIds: string[];
}

export type Viewer = StaffViewer | StudentViewer | FamilyViewer;

/**
 * Loads who a user is for one surface: their linked person record and what
 * gives them access. Returns null if the user has no record of the right kind.
 */
export async function loadViewer(db: Db, userId: string, surface: Surface): Promise<Viewer | null> {
  const [user] = await db
    .select({ id: users.id, kind: users.kind, schoolId: users.schoolId, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.kind !== surface) return null;
  const base = { userId: user.id, schoolId: user.schoolId, displayName: user.displayName };

  if (surface === "staff") {
    const [person] = await db
      .select({ id: staff.id, status: staff.status })
      .from(staff)
      .where(eq(staff.userId, user.id));
    if (!person) return null;
    const roleRows = await db
      .selectDistinct({ role: staffRoles.role })
      .from(staffRoles)
      .innerJoin(schools, eq(schools.id, staffRoles.schoolId))
      .where(and(eq(staffRoles.staffId, person.id), currentOn(staffRoles.startsOn, staffRoles.endsOn)));
    const roles = roleRows.map((r) => r.role as StaffRole).sort();
    return { ...base, kind: "staff", staffId: person.id, roles, hasAccess: person.status === "active" && roles.length > 0 };
  }

  if (surface === "student") {
    const access = await studentAccessForUser(db, user.id);
    if (!access) return null;
    return { ...base, kind: "student", studentId: access.studentId, hasAccess: access.enrolled };
  }

  const access = await familyAccessForUser(db, user.id);
  if (!access) return null;
  return { ...base, kind: "family", ...access, hasAccess: access.studentIds.length > 0 };
}
