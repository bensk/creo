"use client";

import { useRef, useState, useTransition } from "react";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";
import { StudentName, type StudentNameParts } from "@/core/ui/StudentName";
import { searchStudentsAction } from "@/modules/students/actions";
import { addListMembersAction, removeListMemberAction, updateListAction } from "../list-actions";

interface Found { id: string; nameParts: StudentNameParts; grade: number | null; homeroom: string | null; enrolled: boolean }
const field = "h-9 rounded-md border border-line bg-surface px-3 text-sm";

/** Adding students (hand-picked lists), and renaming or archiving, for people who can edit the list. */
export function ListEditor({ list, members }: {
  list: { id: string; name: string; description: string | null; kind: "static" | "dynamic"; archived: boolean };
  members: string[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [name, setName] = useState(list.name);
  const search = useRef<HTMLInputElement>(null);
  useShortcut({ keys: "n", description: "Add a student", group: "This screen", run: () => search.current?.focus() });

  const act = (work: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "That didn't work.");
      setError(null);
      setNotice(done);
    });

  return (
    <div className="grid gap-4">
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      {notice && !error && <p role="status" className="text-sm text-ink-muted">{notice}</p>}
      {list.kind === "static" && !list.archived && (
        <section aria-labelledby="add-h" className="grid gap-2">
          <h2 id="add-h" className="text-lg font-semibold">Add students</h2>
          <input ref={search} type="search" value={query} aria-label="Find a student to add" placeholder="type a name" className={`${field} voice w-72`}
            onChange={(e) => {
              const q = e.target.value;
              setQuery(q);
              if (q.trim().length < 2) return setFound([]);
              start(async () => {
                const results = await searchStudentsAction({ query: q });
                setFound(Array.isArray(results) ? results.filter((r) => r.enrolled && !members.includes(r.id)) : []);
              });
            }} />
          {found.length > 0 && (
            <ul className="grid max-w-xl gap-1">
              {found.map((f) => (
                <li key={f.id} className="flex items-center gap-3 text-sm">
                  <StudentName student={f.nameParts} className="font-medium text-ink-title" />
                  <span className="voice text-xs text-ink-muted">{[f.grade ? `grade ${f.grade}` : null, f.homeroom].filter(Boolean).join(" · ")}</span>
                  <button type="button" disabled={pending} className="ml-auto text-link hover:underline"
                    onClick={() => act(async () => { const r = await addListMembersAction(list.id, [f.id]); if (r.ok) { setQuery(""); setFound([]); } return r; }, "Added.")}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer">Rename or archive</summary>
        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(() => updateListAction({ id: list.id, name, description: list.description, archived: list.archived }), "Saved."); }}>
          <input aria-label="List name" className={field} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={pending} className="h-9 rounded-md border border-line px-3 text-sm">Rename</button>
          <button type="button" disabled={pending} className="h-9 rounded-md border border-line px-3 text-sm"
            onClick={() => act(() => updateListAction({ id: list.id, name, description: list.description, archived: !list.archived }), list.archived ? "Restored." : "Archived.")}>
            {list.archived ? "Restore" : "Archive"}
          </button>
        </form>
      </details>
    </div>
  );
}

/** Takes one student off a hand-picked list. */
export function RemoveFromListButton({ listId, studentId }: { listId: string; studentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="ml-auto flex items-center gap-2">
      {error && <span role="alert" className="text-xs">{error}</span>}
      <button type="button" disabled={pending} className="text-sm text-link hover:underline"
        onClick={() => start(async () => { const r = await removeListMemberAction(listId, studentId); if (!r.ok) setError(r.error); })}>
        Remove
      </button>
    </span>
  );
}
