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

export interface ModuleManifest {
  id: string;
  /** Drizzle tables owned by this module. */
  schema?: Readonly<Record<string, unknown>>;
  permissions?: readonly PermissionDef[];
  nav?: readonly NavItem[];
  commands?: readonly CommandDef[];
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
  return manifest;
}
