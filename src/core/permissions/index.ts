import { isHomeroomTeacherOf, isStaffAssignedToStudent } from "../../modules/cohorts/queries";
import { registry } from "../../modules";
import type { StaffViewer, Viewer } from "../auth/viewer";
import type { Db } from "../db/types";
import { CORE_PERMISSIONS } from "./core-permissions";
import { ROLE_PERMISSIONS, ROLE_SENSITIVITY } from "./matrix";
import { SENSITIVITY_LEVELS, type FieldSensitivity, type Sensitivity } from "./sensitivity";

export { SENSITIVITY_LEVELS, type Sensitivity } from "./sensitivity";

export class Forbidden extends Error {
  constructor(readonly permission: string) {
    super(`Forbidden: ${permission}`);
  }
}

const KNOWN_PERMISSIONS = new Set([...CORE_PERMISSIONS, ...registry.permissions].map((p) => p.key));

function isStaff(viewer: Viewer): viewer is StaffViewer {
  return viewer.kind === "staff" && viewer.hasAccess;
}

/**
 * Whether the viewer may use a permission, optionally for one student. Default
 * deny: unknown permissions, non-staff viewers, and staff without a role
 * granting it are refused. Students and families never pass this check; their
 * portals use their own published-visibility rules.
 */
export async function can(db: Db, viewer: Viewer, permission: string, target?: { studentId?: string }): Promise<boolean> {
  if (!KNOWN_PERMISSIONS.has(permission)) throw new Error(`Unknown permission "${permission}"`);
  if (!isStaff(viewer)) return false;

  let homeroomChecked: boolean | undefined;
  for (const role of viewer.roles) {
    const scope = ROLE_PERMISSIONS[role][permission];
    if (scope === "all") return true;
    if (scope === "homeroom" && target?.studentId) {
      homeroomChecked ??= await isHomeroomTeacherOf(db, viewer.staffId, target.studentId);
      if (homeroomChecked) return true;
    }
  }
  return false;
}

/** Like can(), but throws Forbidden. Use at the top of server actions. */
export async function authorize(db: Db, viewer: Viewer, permission: string, target?: { studentId?: string }): Promise<void> {
  if (!(await can(db, viewer, permission, target))) throw new Forbidden(permission);
}

/** The sensitivity levels this viewer may see for one student. */
export async function visibleLevels(db: Db, viewer: Viewer, studentId: string): Promise<Set<Sensitivity>> {
  const levels = new Set<Sensitivity>();
  if (!isStaff(viewer)) return levels;
  let assigned: boolean | undefined;
  for (const role of viewer.roles) {
    const grant = ROLE_SENSITIVITY[role];
    grant.all.forEach((l) => levels.add(l));
    if (grant.assigned?.some((l) => !levels.has(l))) {
      assigned ??= await isStaffAssignedToStudent(db, viewer.staffId, studentId);
      if (assigned) grant.assigned.forEach((l) => levels.add(l));
    }
  }
  return levels;
}

/** The declared sensitivity of each column of a student-data table, from module manifests. */
export function fieldSensitivityFor(table: string): FieldSensitivity {
  for (const m of registry.modules) {
    const fields = m.fieldSensitivity?.[table];
    if (fields) return fields;
  }
  throw new Error(`No field sensitivity declared for table "${table}"`);
}

/**
 * Returns a copy of a row with every field the viewer may not see removed, and
 * the list of above-standard fields that were returned (for sensitive_reads).
 * Undeclared fields are removed: default deny.
 */
export function redact<T extends Record<string, unknown>>(
  row: T,
  fields: FieldSensitivity,
  levels: ReadonlySet<Sensitivity>,
): { row: Partial<T>; sensitiveFieldsShown: string[] } {
  const out: Partial<T> = {};
  const sensitiveFieldsShown: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    const level = fields[key];
    if (!level || !levels.has(level)) continue;
    (out as Record<string, unknown>)[key] = value;
    if (level !== "standard" && value !== null && value !== undefined) sensitiveFieldsShown.push(key);
  }
  return { row: out, sensitiveFieldsShown };
}

/** Highest of a set of levels, for labeling (e.g. a tracker's inherited sensitivity). */
export function highestLevel(levels: Iterable<Sensitivity>): Sensitivity {
  let best = 0;
  for (const l of levels) best = Math.max(best, SENSITIVITY_LEVELS.indexOf(l));
  return SENSITIVITY_LEVELS[best]!;
}
