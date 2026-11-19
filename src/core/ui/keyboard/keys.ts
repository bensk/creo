// Keyboard shortcuts are written as space-separated steps: "g s" is g then s;
// "mod+k" is ⌘K on a Mac and Ctrl K elsewhere; "?" "/" "escape" "enter" "j".

export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** One key press as a step token, or null for presses shortcuts never use (bare modifiers, alt combos). */
export function eventToStep(e: KeyEventLike, isMac: boolean): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return null;
  if (e.altKey) return null;
  const key = e.key === "Esc" ? "escape" : e.key === " " ? "space" : e.key.toLowerCase();
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod) return `mod+${key}`;
  if (e.metaKey || e.ctrlKey) return null;
  // Shift with a letter is its own step ("shift+p"), so P and p can do different things.
  if (e.shiftKey && /^[a-z]$/.test(key)) return `shift+${key}`;
  // "?" arrives as shift+/ on US keyboards; e.key is already "?".
  return key;
}

export function parseSteps(keys: string): string[] {
  return keys.trim().toLowerCase().split(/\s+/);
}

export type MatchResult =
  | { kind: "match"; keys: string }
  | { kind: "prefix" } // the steps so far start one or more shortcuts
  | { kind: "none" };

/** Whether the steps typed so far complete a shortcut, start one, or neither. */
export function matchSteps(typed: readonly string[], shortcuts: Iterable<string>): MatchResult {
  let prefix = false;
  for (const keys of shortcuts) {
    const steps = parseSteps(keys);
    if (steps.length < typed.length) continue;
    const startsWith = typed.every((step, i) => steps[i] === step);
    if (!startsWith) continue;
    if (steps.length === typed.length) return { kind: "match", keys };
    prefix = true;
  }
  return prefix ? { kind: "prefix" } : { kind: "none" };
}

/** For display: "mod+k" → ["⌘", "K"] on a Mac, ["Ctrl", "K"] elsewhere; "g s" → [["G"], ["S"]]. */
export function displaySteps(keys: string, isMac: boolean): string[][] {
  const names: Record<string, string> = { escape: "Esc", enter: "Enter", space: "Space", arrowup: "↑", arrowdown: "↓" };
  return parseSteps(keys).map((step) =>
    step.split("+").map((part) => (part === "mod" ? (isMac ? "⌘" : "Ctrl") : part === "shift" ? "Shift" : names[part] ?? part.toUpperCase())),
  );
}

/** Typing in a field never triggers single-key shortcuts; only these still work there. */
export const ALLOWED_WHILE_TYPING = new Set(["escape", "mod+k"]);
