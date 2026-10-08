import { describe, expect, it } from "vitest";
import { defineModule } from "./define";
import { createRegistry } from "./registry";

describe("defineModule", () => {
  it("rejects ids that are not kebab-case", () => {
    expect(() => defineModule({ id: "Behavior" })).toThrow(/kebab-case/);
  });

  it("rejects permissions outside the module's namespace", () => {
    expect(() =>
      defineModule({ id: "behavior", permissions: [{ key: "attendance.take", description: "x" }] }),
    ).toThrow(/must start with "behavior\."/);
  });
});

describe("createRegistry", () => {
  const behavior = defineModule({
    id: "behavior",
    permissions: [{ key: "behavior.log", description: "Log behavior" }],
    nav: [{ id: "behavior", label: "Behavior", href: "/behavior", permission: "behavior.log" }],
    commands: [{ id: "behavior.go", label: "Go to Behavior", href: "/behavior", shortcut: "g b" }],
  });

  it("collects permissions, nav, and commands across modules", () => {
    const registry = createRegistry([behavior, defineModule({ id: "attendance" })]);
    expect(registry.permissions.map((p) => p.key)).toEqual(["behavior.log"]);
    expect(registry.nav).toHaveLength(1);
    expect(registry.get("attendance")?.id).toBe("attendance");
  });

  it("rejects duplicate module ids", () => {
    expect(() => createRegistry([behavior, behavior])).toThrow(/Duplicate module id/);
  });

  it("rejects two commands bound to the same shortcut", () => {
    const other = defineModule({
      id: "other",
      commands: [{ id: "other.go", label: "Other", shortcut: "g b" }],
    });
    expect(() => createRegistry([behavior, other])).toThrow(/Duplicate shortcut "g b"/);
  });

  it("rejects nav items that require an unknown permission", () => {
    const broken = defineModule({
      id: "broken",
      nav: [{ id: "broken", label: "Broken", href: "/broken", permission: "broken.view" }],
    });
    expect(() => createRegistry([broken])).toThrow(/unknown permission "broken.view"/);
  });
});
