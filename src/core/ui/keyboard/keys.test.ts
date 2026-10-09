import { describe, expect, it } from "vitest";
import { displaySteps, eventToStep, matchSteps } from "./keys";

const press = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods,
});

describe("eventToStep", () => {
  it("maps ⌘K on a Mac and Ctrl K elsewhere to mod+k", () => {
    expect(eventToStep(press("k", { metaKey: true }), true)).toBe("mod+k");
    expect(eventToStep(press("K", { ctrlKey: true }), false)).toBe("mod+k");
    expect(eventToStep(press("k", { ctrlKey: true }), true)).toBeNull();
  });

  it("reads ? and plain letters, ignores bare modifiers and alt", () => {
    expect(eventToStep(press("?", { shiftKey: true }), true)).toBe("?");
    expect(eventToStep(press("G"), true)).toBe("g");
    expect(eventToStep(press("Shift", { shiftKey: true }), true)).toBeNull();
    expect(eventToStep(press("g", { altKey: true }), true)).toBeNull();
    expect(eventToStep(press("Escape"), true)).toBe("escape");
  });
});

describe("matchSteps", () => {
  const shortcuts = ["g s", "g a", "?", "mod+k", "j"];
  it("matches complete sequences and single keys", () => {
    expect(matchSteps(["g", "s"], shortcuts)).toEqual({ kind: "match", keys: "g s" });
    expect(matchSteps(["?"], shortcuts)).toEqual({ kind: "match", keys: "?" });
  });
  it("recognizes a prefix and rejects strays", () => {
    expect(matchSteps(["g"], shortcuts)).toEqual({ kind: "prefix" });
    expect(matchSteps(["g", "x"], shortcuts)).toEqual({ kind: "none" });
    expect(matchSteps(["x"], shortcuts)).toEqual({ kind: "none" });
  });
});

describe("displaySteps", () => {
  it("shows platform keys", () => {
    expect(displaySteps("mod+k", true)).toEqual([["⌘", "K"]]);
    expect(displaySteps("mod+k", false)).toEqual([["Ctrl", "K"]]);
    expect(displaySteps("g s", true)).toEqual([["G"], ["S"]]);
  });
});
