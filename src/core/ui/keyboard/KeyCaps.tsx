"use client";

import { displaySteps } from "./keys";
import { useKeyboard } from "./KeyboardProvider";

/** Renders a shortcut as key caps, with the sequence's "then" in Maple Mono italic. */
export function KeyCaps({ keys, className = "" }: { keys: string; className?: string }) {
  const { isMac } = useKeyboard();
  const steps = displaySteps(keys, isMac);
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label={keys}>
      {steps.map((parts, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="voice text-xs text-ink-muted">then</span>}
          {parts.map((part) => (
            <kbd key={part} className="kbd">
              {part}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
