"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createTrackerAction, previewPopulationAction } from "../actions";
import type { FieldSpec, Population } from "../model";

type Kind = "live" | "snapshot";
interface Choice { key: string; label: string; group: string; sensitivity: string; partial: boolean }

const TYPE_LABEL: Record<FieldSpec["type"], string> = {
  boolean: "Yes / no", text: "Short text", long_text: "Long text", number: "Number", date: "Date",
  select: "One choice", multi_select: "Several choices", computed: "From student data",
};
const GROUP_TYPE: Record<string, string> = { homeroom: "Homerooms", grade_team: "Grade teams", advisory: "Advisories", intervention: "Interventions", club: "Clubs", team: "Teams", custom: "Other groups" };
const field = "h-9 rounded-md border border-line bg-surface px-3 text-sm";

type Draft = { type: FieldSpec["type"]; label: string; options: string; sensitivity: string; field: string; since: string };
const toDraft = (f: FieldSpec): Draft => f.type === "computed"
  ? { type: "computed", label: f.label, options: "", sensitivity: "standard", field: f.field, since: f.since ?? "" }
  : { type: f.type, label: f.label, options: f.options.join(", "), sensitivity: f.sensitivity, field: "", since: "" };
const fromDraft = (d: Draft): FieldSpec => d.type === "computed"
  ? { type: "computed", label: d.label, field: d.field, since: d.since || null }
  : { type: d.type, label: d.label, options: d.options.split(",").map((o) => o.trim()).filter(Boolean), sensitivity: d.sensitivity as "standard" };

/** Step 1: who the tracker is about. Step 2: its name and columns. Sharing happens on the tracker itself. */
export function NewTrackerFlow({ initialPopulation, template, groups, lists, specChips, computedChoices }: {
  initialPopulation: Population;
  template: { id: string; name: string; description: string | null; fields: FieldSpec[] } | null;
  groups: { id: string; name: string; type: string; students: number }[];
  lists: { id: string; name: string }[];
  specChips: string[];
  computedChoices: Choice[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [population, setPopulation] = useState<Population>(initialPopulation);
  const [preview, setPreview] = useState<{ count: number; sensitivity: string } | { error: string } | null>(null);
  const [name, setName] = useState(template ? template.name.replace(/\s*\(template\)$/i, "") : "");
  const [drafts, setDrafts] = useState<Draft[]>(template ? template.fields.map(toDraft) : [{ type: "boolean", label: "", options: "", sensitivity: "standard", field: "", since: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const spec = initialPopulation.source === "spec" ? initialPopulation.spec : null;

  useEffect(() => {
    let cancelled = false;
    previewPopulationAction(population).then((r) => {
      if (!cancelled) setPreview(r.ok ? { count: r.count, sensitivity: r.sensitivity } : { error: r.error });
    });
    return () => { cancelled = true; };
  }, [population]);

  const setSource = (source: Population["source"]) => {
    const kind = population.kind;
    if (source === "all") setPopulation({ source, kind });
    if (source === "grade") setPopulation({ source, kind, grade: 7 });
    if (source === "group" && groups[0]) setPopulation({ source, kind, ref: groups[0].id });
    if (source === "list" && lists[0]) setPopulation({ source, kind, ref: lists[0].id });
    if (source === "spec" && spec) setPopulation({ source, kind, spec });
  };
  const setKind = (kind: Kind) => setPopulation({ ...population, kind } as Population);
  const update = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  if (step === 1) {
    return (
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-lg font-semibold">Who is it for?</legend>
          <label className="flex items-center gap-2"><input type="radio" name="source" checked={population.source === "all"} onChange={() => setSource("all")} /> Every enrolled student</label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="source" checked={population.source === "grade"} onChange={() => setSource("grade")} /> A grade
            {population.source === "grade" && (
              <select aria-label="Grade" className={field} value={population.grade} onChange={(e) => setPopulation({ ...population, grade: Number(e.target.value) })}>
                {[5, 6, 7, 8].map((g) => <option key={g} value={g}>Grade {g}</option>)}
              </select>
            )}
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="source" checked={population.source === "group"} disabled={!groups.length} onChange={() => setSource("group")} /> A homeroom or other group
            {population.source === "group" && (
              <select aria-label="Group" className={field} value={population.ref} onChange={(e) => setPopulation({ ...population, ref: e.target.value })}>
                {Object.entries(GROUP_TYPE).map(([type, label]) => {
                  const options = groups.filter((g) => g.type === type);
                  return options.length ? <optgroup key={type} label={label}>{options.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup> : null;
                })}
              </select>
            )}
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="source" checked={population.source === "list"} disabled={!lists.length} onChange={() => setSource("list")} /> A list{!lists.length && <span className="voice text-xs text-ink-muted">you don&apos;t have any lists yet</span>}
            {population.source === "list" && (
              <select aria-label="List" className={field} value={population.ref} onChange={(e) => setPopulation({ ...population, ref: e.target.value })}>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
          </label>
          {spec && (
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" name="source" checked={population.source === "spec"} onChange={() => setSource("spec")} /> The students matching your grid filter
              {specChips.map((c) => <span key={c} className="rounded-full border border-line-soft px-2 py-0.5 text-sm">{c}</span>)}
            </label>
          )}
        </fieldset>
        <fieldset className="grid gap-1">
          <legend className="mb-1 font-semibold">As students change</legend>
          <label className="flex items-center gap-2"><input type="radio" name="kind" checked={population.kind === "live"} onChange={() => setKind("live")} /> Keep it up to date: new students are added, students who leave are set aside with their answers kept</label>
          <label className="flex items-center gap-2"><input type="radio" name="kind" checked={population.kind === "snapshot"} onChange={() => setKind("snapshot")} /> Just these students; add or remove by hand later</label>
        </fieldset>
        <p className="voice text-sm text-ink-muted" aria-live="polite">
          {!preview ? "counting…" : "error" in preview ? preview.error.toLowerCase() : `${preview.count} students${preview.sensitivity !== "standard" ? ` · ${preview.sensitivity}: sharing will be limited` : ""}`}
        </p>
        <div><button type="submit" disabled={!preview || "error" in preview} className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-50">Next: name and columns</button></div>
      </form>
    );
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const fields = drafts.filter((d) => d.label.trim()).map(fromDraft);
          const res = await createTrackerAction({ name, population, fields, templateId: template?.id ?? null });
          if (!res.ok) return setError(res.error);
          router.push(`/trackers/${res.data.id}`);
        });
      }}
    >
      <label className="grid gap-1">
        <span className="text-lg font-semibold">Name</span>
        <input autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DC Trip 2027" className={`${field} max-w-md`} />
      </label>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-lg font-semibold">Columns</legend>
        {drafts.map((d, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-line-soft p-3">
            <label className="grid gap-1 text-sm">
              <span className="voice text-xs text-ink-muted">column</span>
              <input aria-label={`Column ${i + 1} name`} value={d.label} maxLength={80} onChange={(e) => update(i, { label: e.target.value })} placeholder="e.g. Permission slip" className={field} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="voice text-xs text-ink-muted">kind</span>
              <select aria-label={`Column ${i + 1} kind`} className={field} value={d.type}
                onChange={(e) => update(i, { type: e.target.value as Draft["type"], field: e.target.value === "computed" ? (computedChoices[0]?.key ?? "") : "" })}>
                {(Object.keys(TYPE_LABEL) as FieldSpec["type"][]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            {(d.type === "select" || d.type === "multi_select") && (
              <label className="grid gap-1 text-sm">
                <span className="voice text-xs text-ink-muted">choices, separated by commas</span>
                <input value={d.options} onChange={(e) => update(i, { options: e.target.value })} placeholder="Not started, In progress, Done" className={`${field} w-64`} />
              </label>
            )}
            {d.type === "computed" ? (
              <>
                <label className="grid gap-1 text-sm">
                  <span className="voice text-xs text-ink-muted">student field</span>
                  <select className={field} value={d.field} onChange={(e) => update(i, { field: e.target.value, label: d.label || (computedChoices.find((c) => c.key === e.target.value)?.label ?? "") })}>
                    {computedChoices.map((c) => <option key={c.key} value={c.key}>{c.label}{c.sensitivity !== "standard" ? ` (${c.sensitivity})` : ""}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="voice text-xs text-ink-muted">counting from (optional)</span>
                  <input type="date" className={field} value={d.since} onChange={(e) => update(i, { since: e.target.value })} />
                </label>
              </>
            ) : (
              <label className="grid gap-1 text-sm">
                <span className="voice text-xs text-ink-muted">who can see it</span>
                <select className={field} value={d.sensitivity} onChange={(e) => update(i, { sensitivity: e.target.value })}>
                  <option value="standard">Everyone it&apos;s shared with</option>
                  <option value="restricted">Restricted</option>
                  <option value="sensitive">Sensitive</option>
                  <option value="confidential">Confidential</option>
                </select>
              </label>
            )}
            <button type="button" className="ml-auto text-sm text-link hover:underline" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}>Remove<span className="sr-only"> column {i + 1}</span></button>
          </div>
        ))}
        <div>
          <button type="button" className="h-9 rounded-md border border-line px-3 text-sm" onClick={() => setDrafts((ds) => [...ds, { type: "boolean", label: "", options: "", sensitivity: "standard", field: "", since: "" }])}>Add a column</button>
        </div>
        <p className="voice text-xs text-ink-muted">columns can be added and removed later too.</p>
      </fieldset>
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setStep(1)} className="h-9 rounded-md border border-line px-3 text-sm">Back</button>
        <button type="submit" disabled={pending || !name.trim()} className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-50">Create tracker</button>
      </div>
    </form>
  );
}
