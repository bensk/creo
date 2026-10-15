"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";
import { createGroupAction } from "../actions";

const TYPES = [
  ["intervention", "Intervention"], ["advisory", "Advisory"], ["club", "Club"], ["team", "Team"], ["custom", "Other"],
] as const;

export function NewGroupForm() {
  const router = useRouter();
  const name = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({ name: "", type: "intervention" as (typeof TYPES)[number][0], grade: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useShortcut({ keys: "n", description: "New group", group: "This screen", run: () => name.current?.focus() });

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-line-soft p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createGroupAction({ name: draft.name, type: draft.type, gradeLevel: draft.grade ? Number(draft.grade) : null });
          if (!res.ok) return setError(res.error);
          router.push(`/groups/${res.data.id}`);
        });
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="voice text-xs text-ink-muted">new group</span>
        <input ref={name} required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="e.g. Tier 2 Math, grade 7" className="h-9 w-64 rounded-md border border-line bg-surface px-3" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="voice text-xs text-ink-muted">kind</span>
        <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as typeof draft.type })} className="h-9 rounded-md border border-line bg-surface px-2">
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="voice text-xs text-ink-muted">grade</span>
        <select value={draft.grade} onChange={(e) => setDraft({ ...draft, grade: e.target.value })} className="h-9 rounded-md border border-line bg-surface px-2">
          <option value="">Any</option>
          {[5, 6, 7, 8].map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
      <button type="submit" disabled={pending} className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-60">Create</button>
      {error && <p role="alert" className="w-full rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
    </form>
  );
}
