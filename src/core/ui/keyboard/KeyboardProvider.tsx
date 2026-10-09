"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode,
} from "react";
import { ALLOWED_WHILE_TYPING, eventToStep, matchSteps, parseSteps } from "./keys";
import { HelpSheet } from "./HelpSheet";

// The one keyboard layer (CLAUDE.md). Screens register shortcuts with
// useShortcut(); everything registered appears in the ? help sheet.

export interface Shortcut {
  keys: string;
  description: string;
  /** Heading in the help sheet, e.g. "Go to", "This screen". */
  group: string;
  run: () => void;
}

interface KeyboardContextValue {
  register: (shortcut: Shortcut) => () => void;
  shortcuts: () => Shortcut[];
  isMac: boolean;
  openHelp: () => void;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);
const SEQUENCE_TIMEOUT_MS = 1200;
const noSubscribe = () => () => {};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<number, Shortcut>());
  const nextId = useRef(0);
  const typed = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const isMac = useSyncExternalStore(
    noSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => true,
  );

  const register = useCallback((shortcut: Shortcut) => {
    const id = nextId.current++;
    registry.current.set(id, shortcut);
    return () => {
      registry.current.delete(id);
    };
  }, []);

  const shortcuts = useCallback(() => {
    // Later registrations win, so a screen can override a global key.
    const byKeys = new Map<string, Shortcut>();
    for (const s of registry.current.values()) byKeys.set(s.keys, s);
    return [...byKeys.values()];
  }, []);

  const reset = useCallback(() => {
    typed.current = [];
    setPending([]);
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const step = eventToStep(e, isMac);
      if (!step) return;
      if (isTypingTarget(e.target) && !ALLOWED_WHILE_TYPING.has(step)) return;

      const all = shortcuts();
      const result = matchSteps([...typed.current, step], all.map((s) => s.keys));
      if (result.kind === "match") {
        // Esc is left alone so dialogs and menus still close themselves.
        if (step !== "escape") e.preventDefault();
        reset();
        all.find((s) => s.keys === result.keys)?.run();
      } else if (result.kind === "prefix") {
        e.preventDefault();
        typed.current = [...typed.current, step];
        setPending(typed.current);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(reset, SEQUENCE_TIMEOUT_MS);
      } else {
        reset();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMac, reset, shortcuts]);

  const value = useMemo<KeyboardContextValue>(
    () => ({ register, shortcuts, isMac, openHelp: () => setHelpOpen(true) }),
    [register, shortcuts, isMac],
  );

  return (
    <KeyboardContext.Provider value={value}>
      {children}
      <GlobalShortcuts onHelp={() => setHelpOpen((open) => !open)} />
      {pending.length > 0 && (
        <div
          role="status"
          className="voice fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-line bg-surface-raised px-3 py-1.5 text-sm text-ink-title shadow-sm"
        >
          {pending.join(" then ")} then…
        </div>
      )}
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </KeyboardContext.Provider>
  );
}

function GlobalShortcuts({ onHelp }: { onHelp: () => void }) {
  useShortcut({ keys: "?", description: "Show keyboard shortcuts", group: "Anywhere", run: onHelp });
  // Dialogs close themselves on Esc; elsewhere Esc leaves the current field or selection.
  useShortcut({
    keys: "escape",
    description: "Close, cancel, or clear selection",
    group: "Anywhere",
    run: () => (document.activeElement as HTMLElement | null)?.blur(),
  });
  return null;
}

export function useKeyboard(): KeyboardContextValue {
  const ctx = useContext(KeyboardContext);
  if (!ctx) throw new Error("useKeyboard must be used inside KeyboardProvider");
  return ctx;
}

/** Registers a shortcut while the calling component is mounted. */
export function useShortcut(shortcut: Shortcut, enabled = true): void {
  const { register } = useKeyboard();
  const latest = useRef(shortcut);
  useEffect(() => {
    latest.current = shortcut;
  });
  const { keys, description, group } = shortcut;
  useEffect(() => {
    if (!enabled) return;
    parseSteps(keys); // validates the format early in development
    return register({ keys, description, group, run: () => latest.current.run() });
  }, [register, keys, description, group, enabled]);
}
