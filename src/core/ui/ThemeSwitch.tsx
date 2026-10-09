"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { setThemeAction } from "./theme-actions";
import { THEMES, type Theme } from "./theme";

const LABELS: Record<Theme, string> = { system: "auto", light: "light", dark: "dark" };

export function ThemeSwitch({ value }: { value: Theme }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [current, setCurrent] = useOptimistic(value);

  return (
    <div role="radiogroup" aria-label="Theme" className="voice flex rounded-md border border-line-soft p-0.5 text-xs">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={current === t}
          onClick={() =>
            startTransition(async () => {
              setCurrent(t);
              // Apply immediately; the cookie keeps it for next time.
              if (t === "system") document.documentElement.removeAttribute("data-theme");
              else document.documentElement.setAttribute("data-theme", t);
              await setThemeAction(t);
              router.refresh();
            })
          }
          className="flex-1 rounded px-2 py-1 text-ink-muted aria-checked:bg-surface aria-checked:text-ink-title"
        >
          {LABELS[t]}
        </button>
      ))}
    </div>
  );
}
