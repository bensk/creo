"use client";

import { useState, useTransition } from "react";
import { StudentName, type StudentNameParts } from "@/core/ui/StudentName";
import { searchStudentsAction } from "@/modules/students/actions";
import { addTrackerFieldAction, addTrackerRowsAction, archiveTrackerFieldAction, saveTrackerTemplateAction, updateTrackerAction } from "../actions";
import type { FieldSpec } from "../model";
import { NEEDS_VALUE, type RuleOp } from "../rules";
import type { TrackerColumn } from "../table";

interface Found { id: string; nameParts: StudentNameParts; grade: number | null; homeroom: string | null; enrolled: boolean }
const field = "h-9 rounded-md border border-line bg-surface px-3 text-sm";
const button = "h-9 rounded-md border border-line px-3 text-sm disabled:opacity-50";
const TYPES: [FieldSpec["type"], string][] = [
  ["boolean", "Yes / no"], ["text", "Short text"], ["long_text", "Long text"], ["number", "Number"], ["date", "Date"],
  ["select", "One choice"], ["multi_select", "Several choices"], ["computed", "From student data"], ["rule", "Rule: yes when all conditions hold"],
];
type Cond = { column: string; op: RuleOp; value: string };
const OPS_FOR = (type: string): [RuleOp, string][] =>
  type === "boolean" ? [["is_true", "is yes"], ["is_false", "is no"], ["is_empty", "is empty"]]
  : type === "number" || type === "date" || type === "computed" ? [["gte", "is at least"], ["lte", "is at most"], ["gt", "is more than"], ["lt", "is less than"], ["eq", "is"], ["is_empty", "is empty"], ["is_not_empty", "is filled in"]]
  : [["eq", "is"], ["neq", "is not"], ["is_empty", "is empty"], ["is_not_empty", "is filled in"]];

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
  const ruleable = columns.filter((c) => c.type !== "rule");
  const blankCond = (): Cond => ({ column: ruleable[0]?.key ?? "", op: (OPS_FOR(ruleable[0]?.type ?? "text")[0]![0]), value: "" });
  const [conds, setConds] = useState<Cond[]>([blankCond()]);
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
            const spec: FieldSpec = draft.type === "rule"
              ? { type: "rule", label: draft.label, all: conds.map((c) => ({ column: c.column, op: c.op, value: NEEDS_VALUE.has(c.op) ? (c.value.trim() === "" ? null : Number.isFinite(Number(c.value)) && ruleable.find((r) => r.key === c.column)?.type !== "text" ? Number(c.value) : c.value) : null })) }
              : draft.type === "computed"
              ? { type: "computed", label: draft.label || (computedChoices.find((c) => c.key === draft.field)?.label ?? ""), field: draft.field, since: draft.since || null }
              : { type: draft.type, label: draft.label, options: draft.options.split(",").map((o) => o.trim()).filter(Boolean), sensitivity: draft.sensitivity as "standard" };
            act(() => addTrackerFieldAction(tracker.id, spec), `Added “${spec.label}”.`, () => { setDraft({ ...draft, label: "", options: "" }); setPanel(null); });
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
          {draft.type === "rule" ? (
            <div className="grid w-full gap-2">
              <span className="voice text-xs text-ink-muted">yes when all of these hold</span>
              {ruleable.length === 0 && <p className="text-sm">Add the columns this rule checks first.</p>}
              {conds.map((c, i) => {
                const col = ruleable.find((r) => r.key === c.column);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Condition ${i + 1} column`} className={field} value={c.column}
                      onChange={(e) => { const t = ruleable.find((r) => r.key === e.target.value)?.type ?? "text"; setConds(conds.map((x, j) => (j === i ? { column: e.target.value, op: OPS_FOR(t)[0]![0], value: "" } : x))); }}>
                      {ruleable.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                    <select aria-label={`Condition ${i + 1} test`} className={field} value={c.op} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, op: e.target.value as RuleOp } : x)))}>
                      {OPS_FOR(col?.type ?? "text").map(([op, text]) => <option key={op} value={op}>{text}</option>)}
                    </select>
                    {NEEDS_VALUE.has(c.op) && (
                      col && (col.type === "select" || col.type === "multi_select") ? (
                        <select aria-label={`Condition ${i + 1} value`} className={field} value={c.value} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}>
                          <option value="">Choose</option>
                          {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input aria-label={`Condition ${i + 1} value`} className={`${field} w-32`} type={col?.type === "date" ? "date" : "text"} value={c.value}
                          onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                      )
                    )}
                    {conds.length > 1 && <button type="button" className="text-sm text-link hover:underline" onClick={() => setConds(conds.filter((_, j) => j !== i))}>Remove<span className="sr-only"> condition {i + 1}</span></button>}
                  </div>
                );
              })}
              {conds.length < 10 && ruleable.length > 0 && <div><button type="button" className="text-sm text-link hover:underline" onClick={() => setConds([...conds, blankCond()])}>And another condition</button></div>}
            </div>
          ) : draft.type === "computed" ? (
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
