"use client";

import { useRef, useState, useTransition } from "react";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";
import { StudentName, type StudentNameParts } from "@/core/ui/StudentName";
import { searchStudentsAction } from "@/modules/students/actions";
import { signInLateAction } from "../actions";

interface Found { id: string; nameParts: StudentNameParts; phonetic: string | null; grade: number | null; homeroom: string | null; enrolled: boolean }

/** Type a name, Enter signs in the first match; or pick one. */
export function LateDesk() {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useShortcut({ keys: "n", description: "Find a student to sign in", group: "This screen", run: () => input.current?.focus() });

  const signIn = (f: Found) =>
    start(async () => {
      const r = await signInLateAction(f.id);
      if (!r.ok) return setError(r.error);
      setError(null);
      setNotice(`Signed in ${f.nameParts.preferredFirstName ?? f.nameParts.legalFirstName}.`);
      setQuery("");
      setFound([]);
      input.current?.focus();
    });

  return (
    <div className="grid gap-2">
      <input
        ref={input}
        autoFocus
        type="search"
        aria-label="Find a student who arrived late"
        placeholder="type a name, then enter"
        className="voice h-11 w-full max-w-md rounded-md border border-line bg-surface px-3"
        value={query}
        onKeyDown={(e) => { if (e.key === "Enter" && found[0]) { e.preventDefault(); signIn(found[0]); } }}
        onChange={(e) => {
          const q = e.target.value;
          setQuery(q);
          if (q.trim().length < 2) return setFound([]);
          start(async () => {
            const results = await searchStudentsAction({ query: q });
            setFound(Array.isArray(results) ? results.filter((r) => r.enrolled) : []);
          });
        }}
      />
      {notice && !error && <p role="status" className="text-sm text-ink-muted">{notice}</p>}
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      <ul className="grid max-w-xl gap-1">
        {found.map((f, i) => (
          <li key={f.id} className="flex items-center gap-3 text-sm">
            <StudentName student={f.nameParts} phonetic={f.phonetic} className="font-medium text-ink-title" />
            <span className="voice text-xs text-ink-muted">{[f.grade ? `grade ${f.grade}` : null, f.homeroom, i === 0 ? "enter" : null].filter(Boolean).join(" · ")}</span>
            <button type="button" disabled={pending} className="ml-auto h-11 rounded-md border border-line px-3" onClick={() => signIn(f)}>Sign in late</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
