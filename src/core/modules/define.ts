import type { FieldSensitivity } from "../permissions/sensitivity";
import type { FieldDef, SourceDef } from "../query/source";

// The module contract. Every module in src/modules/<id>/manifest.ts exports
// `manifest = defineModule({...})`, and src/modules/index.ts registers it.
// Further manifest sections (query sources, profile tabs, notifications) are
// added here when the phase that needs them starts.

export interface PermissionDef {
  /** Must start with "<module id>." e.g. "behavior.log". */
  key: string;
  description: string;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  /** Hidden unless the viewer has this permission. Omit only for items every staff member sees. */
  permission?: string;
}

export interface CommandDef {
  id: string;
  label: string;
  href?: string;
  /** Keyboard shortcut in the keyboard layer's notation, e.g. "g s". */
  shortcut?: string;
  permission?: string;
}

export interface NotificationTypeDef {
  /** Must start with "<module id>." e.g. "attendance.chronic_absence". */
  type: string;
  label: string;
  description: string;
}

export interface ModuleManifest {
  id: string;
  /** Drizzle tables owned by this module. */
  schema?: Readonly<Record<string, unknown>>;
  /**
   * Sensitivity of every column of each student-data table this module owns,
   * keyed by SQL table name then column name. A test fails if a column is missing.
   */
  fieldSensitivity?: Readonly<Record<string, FieldSensitivity>>;
  permissions?: readonly PermissionDef[];
  /** Query sources this module owns (e.g. "students"). */
  sources?: readonly SourceDef[];
  /** Fields this module adds to any module's source, keyed by source id. */
  sourceFields?: Readonly<Record<string, readonly FieldDef[]>>;
  nav?: readonly NavItem[];
  commands?: readonly CommandDef[];
  /** Slack notification types. Where each goes lives in slack_rules (data), not here. */
  notifications?: readonly NotificationTypeDef[];
}

const MODULE_ID = /^[a-z][a-z0-9-]*$/;

export function defineModule<const M extends ModuleManifest>(manifest: M): M {
  if (!MODULE_ID.test(manifest.id)) {
    throw new Error(`Module id "${manifest.id}" must be lowercase kebab-case`);
  }
  for (const permission of manifest.permissions ?? []) {
    if (!permission.key.startsWith(`${manifest.id}.`)) {
      throw new Error(
        `Permission "${permission.key}" in module "${manifest.id}" must start with "${manifest.id}."`,
      );
    }
  }
  for (const n of manifest.notifications ?? []) {
    if (!n.type.startsWith(`${manifest.id}.`)) {
      throw new Error(`Notification "${n.type}" in module "${manifest.id}" must start with "${manifest.id}."`);
    }
  }
  return manifest;
}
