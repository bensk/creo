import type { PermissionDef } from "../modules/define";

// Permissions owned by the core (not by any module). Same shape as module permissions.
export const CORE_PERMISSIONS: readonly PermissionDef[] = [
  { key: "core.audit.read", description: "Read the change log (values redacted to the reader's sensitivity)" },
  { key: "core.roles.manage", description: "Assign staff roles by hand and edit the Google Group to role mapping" },
  { key: "core.visibility.manage", description: "Choose what students and families can see" },
];
