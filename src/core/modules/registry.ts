import type { CommandDef, ModuleManifest, NavItem, PermissionDef } from "./define";

export interface ModuleRegistry {
  modules: readonly ModuleManifest[];
  get(id: string): ModuleManifest | undefined;
  permissions: readonly PermissionDef[];
  nav: readonly NavItem[];
  commands: readonly CommandDef[];
}

function assertUnique(kind: string, values: readonly string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${kind} "${value}"`);
    seen.add(value);
  }
}

// Builds the registry and fails fast on collisions between modules, so a
// conflicting id, permission, or shortcut is caught at startup and in tests.
export function createRegistry(modules: readonly ModuleManifest[]): ModuleRegistry {
  const permissions = modules.flatMap((m) => m.permissions ?? []);
  const nav = modules.flatMap((m) => m.nav ?? []);
  const commands = modules.flatMap((m) => m.commands ?? []);

  assertUnique("module id", modules.map((m) => m.id));
  assertUnique("permission", permissions.map((p) => p.key));
  assertUnique("nav item", nav.map((n) => n.id));
  assertUnique("command", commands.map((c) => c.id));
  assertUnique("shortcut", commands.flatMap((c) => (c.shortcut ? [c.shortcut] : [])));

  const known = new Set(permissions.map((p) => p.key));
  for (const item of [...nav, ...commands]) {
    if (item.permission && !known.has(item.permission)) {
      throw new Error(`"${item.id}" requires unknown permission "${item.permission}"`);
    }
  }

  const byId = new Map(modules.map((m) => [m.id, m]));
  return {
    modules,
    get: (id) => byId.get(id),
    permissions,
    nav,
    commands,
  };
}
