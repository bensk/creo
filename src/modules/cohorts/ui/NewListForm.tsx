"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";
import { createListAction } from "../list-actions";

/** A new hand-picked list. Lists that follow a filter are saved from the student grid. */
export function NewListForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useShortcut({ keys: "n", description: "New list", group: "This screen", run: () => input.current?.focus() });
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-line-soft p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createListAction({ name, kind: "static" });
          if (!res.ok) return setError(res.error);
          router.push(`/lists/${res.data.id}`);
        });
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="voice text-xs text-ink-muted">new list</span>
        <input ref={input} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DC trip: forms missing"
          className="h-9 w-72 rounded-md border border-line bg-surface px-3" />
      </label>
      <button type="submit" disabled={pending} className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-60">Create</button>
      {error && <p role="alert" className="w-full rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
    </form>
  );
}
