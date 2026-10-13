import type { StaffRole } from "../db/columns";
import type { Sensitivity } from "./sensitivity";

// The role and sensitivity matrix, in one place. It mirrors the "Student Data
// Access Matrix" sign-off page (draft 1, October 8, 2026). Entries marked
// PROPOSED are awaiting sign-off by the Head of School and AP; change them here
// and nowhere else. Default deny: anything not listed is refused.

/** Which sensitivity levels each role sees, for all students and (optionally) for assigned students. */
export const ROLE_SENSITIVITY: Readonly<
  Record<StaffRole, { all: readonly Sensitivity[]; assigned?: readonly Sensitivity[] }>
> = {
  leader: { all: ["standard", "restricted", "sensitive", "confidential"] },
  admin: { all: ["standard", "restricted", "sensitive", "confidential"] },
  support: { all: ["standard", "restricted", "sensitive", "confidential"] },
  ops: { all: ["standard", "restricted"] },
  // Teachers follow accommodations for the students they work with.
  teacher: { all: ["standard"], assigned: ["sensitive"] },
  coach: { all: ["standard"] },
};

/**
 * How far a permission reaches for a role. "all": any student. "homeroom": only
 * students in the staff member's current homeroom. Permissions that are not
 * about a student use "all".
 */
export type PermissionScope = "all" | "homeroom";

/** Role → permission key → scope. A key missing for a role is denied. */
export const ROLE_PERMISSIONS: Readonly<Record<StaffRole, Readonly<Record<string, PermissionScope>>>> = {
  leader: {
    "students.edit_alerts": "all", // PROPOSED
    "students.edit_supports": "all", // PROPOSED
    "students.manage_fields": "all", // PROPOSED
    "slack.manage": "all",
    "students.view": "all",
    "students.edit_identity": "all", // PROPOSED
    "students.manage_enrollment": "all", // PROPOSED
    "students.edit_contacts": "all", // PROPOSED
    "cohorts.view": "all",
    "cohorts.manage": "all", // PROPOSED
    "core.audit.read": "all",
    "core.visibility.manage": "all",
  },
  admin: {
    "students.edit_alerts": "all", // PROPOSED
    "students.manage_fields": "all", // PROPOSED
    "integrations.run_imports": "all", // PROPOSED
    "slack.manage": "all",
    // CLAUDE.md: student names go only to private channels an admin has allowlisted.
    "slack.allow_names": "all",
    "students.view": "all",
    "students.edit_identity": "all", // PROPOSED
    "students.manage_enrollment": "all", // PROPOSED
    "students.edit_contacts": "all", // PROPOSED
    "cohorts.view": "all",
    "cohorts.manage": "all", // PROPOSED
    "core.audit.read": "all",
    "core.roles.manage": "all",
    "core.visibility.manage": "all",
  },
  ops: {
    "students.edit_alerts": "all", // PROPOSED
    "integrations.run_imports": "all", // PROPOSED
    "students.view": "all",
    "students.edit_identity": "all", // PROPOSED
    "students.manage_enrollment": "all", // PROPOSED
    "students.edit_contacts": "all", // PROPOSED
    "cohorts.view": "all",
    "cohorts.manage": "all", // PROPOSED
  },
  support: {
    "students.edit_alerts": "all", // PROPOSED
    "students.edit_supports": "all", // PROPOSED
    "students.view": "all",
    "students.edit_identity": "all", // PROPOSED
    "cohorts.view": "all",
  },
  teacher: {
    "students.view": "all",
    "students.edit_identity": "homeroom", // PROPOSED
    "cohorts.view": "all",
  },
  coach: {
    "students.view": "all",
    "cohorts.view": "all",
  },
};
