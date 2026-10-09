"use client";

import { useEffect, useRef } from "react";
import { KeyCaps } from "./KeyCaps";
import { useKeyboard } from "./KeyboardProvider";

const GROUP_ORDER = ["Anywhere", "Go to", "This screen"];

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { shortcuts } = useKeyboard();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const groups = new Map<string, ReturnType<typeof shortcuts>>();
  if (open) {
    for (const s of shortcuts()) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  }
  const ordered = [...groups.entries()].sort(
    ([a], [b]) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99),
  );

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="help-sheet-title"
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-scrim"
    >
      <div className="flex items-baseline justify-between border-b border-line-soft px-5 py-4">
        <h2 id="help-sheet-title" className="text-lg font-semibold">
          Keyboard shortcuts
        </h2>
        <button type="button" onClick={onClose} className="voice text-sm text-ink-muted hover:text-ink">
          esc to close
        </button>
      </div>
      <div className="grid max-h-[70vh] gap-6 overflow-y-auto px-5 py-4">
        {ordered.map(([group, items]) => (
          <section key={group} className="grid gap-2">
            <h3 className="voice text-sm font-normal text-ink-muted">{group.toLowerCase()}</h3>
            <ul className="grid gap-1.5">
              {items.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-4">
                  <span>{s.description}</span>
                  <KeyCaps keys={s.keys} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </dialog>
  );
}
