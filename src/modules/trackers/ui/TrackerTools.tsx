"use client";

import { useState, useTransition } from "react";
import { StudentName, type StudentNameParts } from "@/core/ui/StudentName";
import { searchStudentsAction } from "@/modules/students/actions";
import { addTrackerFieldAction, addTrackerRowsAction, archiveTrackerFieldAction, saveTrackerTemplateAction, updateTrackerAction } from "../actions";
import type { FieldSpec } from "../model";
import type { TrackerColumn } from "../table";

interface Found { id: string; nameParts: StudentNameParts; grade: number | null; homeroom: string | null; enrolled: boolean }
const field = "h-9 rounded-md border border-line bg-surface px-3 text-sm";
const button = "h-9 rounded-md border border-line px-3 text-sm disabled:opacity-50";
const TYPES: [FieldSpec["type"], string][] = [
  ["boolean", "Yes / no"], ["text", "Short text"], ["long_text", "Long text"], ["number", "Number"], ["date", "Date"],
  ["select", "One choice"], ["multi_select", "Several choices"], ["computed", "From student data"],
];

/** Adding columns and students, templates, rename and archive: for people who can edit the tracker. */
export function TrackerTools({ tracker, columns, snapshot, computedChoices }: {
  tracker: { id: string; name: string; description: string | null; archived: boolean };
  columns: TrackerColumn[];
  snapshot: boolean;
  computedChoices: { key: string; label: string; sensitivity: string }[];
}) {
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<"column" | "students" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ type: "boolean" as FieldSpec["type"], label: "", options: "", sensitivity: "standard", field: computedChoices[0]?.key ?? "", since: "" });
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [name, setName] = useState(tracker.name);
  const act = (work: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) =>
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "That didn't work.");
      setError(null);
      setNotice(done);
      after?.();
    });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {!tracker.archived && <button type="button" className={button} onClick={() => setPanel(panel === "column" ? null : "column")}>Add a column</button>}
        {!tracker.archived && snapshot && <button type="button" className={button} onClick={() => setPanel(panel === "students" ? null : "students")}>Add students</button>}
        <button type="button" className={button} onClick={() => setPanel(panel === "more" ? null : "more")}>More</button>
        <a href={`/trackers/${tracker.id}/export`} className={`${button} flex items-center`}>Download CSV</a>
      </div>
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      {notice && !error && <p role="status" className="text-sm text-ink-muted">{notice}</p>}

      {panel === "column" && (
        <form className="flex flex-wrap items-end gap-2 rounded-lg border border-line-soft p-3" onKeyDown={(e) => e.key === "Escape" && setPanel(null)}
          onSubmit={(e) => {
            e.preventDefault();
            const spec: FieldSpec = draft.type === "computed"
              ? { type: "computed", label: draft.label || (computedChoices.find((c) => c.key === draft.field)?.label ?? ""), field: draft.field, since: draft.since || null }
              : { type: draft.type, label: draft.label, options: draft.options.split(",").map((o) => o.trim()).filter(Boolean), sensitivity: draft.sensitivity as "standard" };
            act(() => addTrackerFieldAction(tracker.id, spec), `Added “${spec.label}”.`, () => setDraft({ ...draft, label: "", options: "" }));
          }}>
          <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">column</span>
            <input autoFocus className={field} value={draft.label} maxLength={80} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Deposit paid" /></label>
          <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">kind</span>
            <select className={field} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as FieldSpec["type"] })}>
              {TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
            </select></label>
          {(draft.type === "select" || draft.type === "multi_select") && (
            <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">choices, separated by commas</span>
              <input className={`${field} w-64`} value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} /></label>
          )}
          {draft.type === "computed" ? (
            <>
              <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">student field</span>
                <select className={field} value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value })}>
                  {computedChoices.map((c) => <option key={c.key} value={c.key}>{c.label}{c.sensitivity !== "standard" ? ` (${c.sensitivity})` : ""}</option>)}
                </select></label>
              <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">counting from (optional)</span>
                <input type="date" className={field} value={draft.since} onChange={(e) => setDraft({ ...draft, since: e.target.value })} /></label>
            </>
          ) : (
            <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">who can see it</span>
              <select className={field} value={draft.sensitivity} onChange={(e) => setDraft({ ...draft, sensitivity: e.target.value })}>
                <option value="standard">Everyone it&apos;s shared with</option><option value="restricted">Restricted</option>
                <option value="sensitive">Sensitive</option><option value="confidential">Confidential</option>
              </select></label>
          )}
          <button type="submit" disabled={pending} className={button}>Add</button>
        </form>
      )}

      {panel === "students" && (
        <div className="grid gap-2 rounded-lg border border-line-soft p-3">
          <input autoFocus type="search" value={query} aria-label="Find a student to add" placeholder="type a name" className={`${field} voice w-72`}
            onKeyDown={(e) => e.key === "Escape" && setPanel(null)}
            onChange={(e) => {
              const q = e.target.value;
              setQuery(q);
              if (q.trim().length < 2) return setFound([]);
              start(async () => {
                const results = await searchStudentsAction({ query: q });
                setFound(Array.isArray(results) ? results.filter((r) => r.enrolled) : []);
              });
            }} />
          <ul className="grid max-w-xl gap-1">
            {found.map((f) => (
              <li key={f.id} className="flex items-center gap-3 text-sm">
                <StudentName student={f.nameParts} className="font-medium text-ink-title" />
                <span className="voice text-xs text-ink-muted">{[f.grade ? `grade ${f.grade}` : null, f.homeroom].filter(Boolean).join(" · ")}</span>
                <button type="button" disabled={pending} className="ml-auto text-link hover:underline"
                  onClick={() => act(() => addTrackerRowsAction(tracker.id, [f.id]), "Added.", () => { setQuery(""); setFound([]); })}>Add</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {panel === "more" && (
        <div className="grid gap-3 rounded-lg border border-line-soft p-3 text-sm">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(() => updateTrackerAction({ id: tracker.id, name, description: tracker.description, archived: tracker.archived }), "Saved."); }}>
            <input aria-label="Tracker name" className={field} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            <button type="submit" disabled={pending} className={button}>Rename</button>
            <button type="button" disabled={pending} className={button}
              onClick={() => act(() => updateTrackerAction({ id: tracker.id, name, description: tracker.description, archived: !tracker.archived }), tracker.archived ? "Restored." : "Archived. Its answers are kept.")}>
              {tracker.archived ? "Restore" : "Archive"}
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending} className={button} onClick={() => act(() => saveTrackerTemplateAction(tracker.id, `${tracker.name} (template)`, true), "Saved as a template everyone can start from.")}>Save as template</button>
            <span className="voice text-xs text-ink-muted">keeps the columns, not the students or answers.</span>
          </div>
          {columns.length > 0 && !tracker.archived && (
            <div className="flex flex-wrap items-center gap-2">
              <span>Remove a column:</span>
              {columns.map((c) => (
                <button key={c.key} type="button" disabled={pending} className="text-link hover:underline"
                  onClick={() => act(() => archiveTrackerFieldAction(tracker.id, c.key), `Removed “${c.label}”. Its answers are kept.`)}>{c.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
