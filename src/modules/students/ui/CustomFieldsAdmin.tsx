"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Sensitivity } from "@/core/permissions/sensitivity";
import type { CustomFieldDef, CustomFieldType } from "../custom-field-defs";
import { createCustomFieldAction, updateCustomFieldAction } from "../grid-actions";

const TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Short text", long_text: "Long text", number: "Number", date: "Date", boolean: "Yes / no",
  select: "One choice", multi_select: "Several choices",
};
const LEVELS: { value: Sensitivity; label: string; note: string }[] = [
  { value: "standard", label: "Standard", note: "every staff member" },
  { value: "restricted", label: "Restricted", note: "ops, support, leaders, admin" },
  { value: "sensitive", label: "Sensitive", note: "support, leaders, admin; teachers for their own students" },
  { value: "confidential", label: "Confidential", note: "support, leaders, admin" },
];
const parseOptions = (text: string) => text.split(",").map((o) => o.trim()).filter(Boolean);

export function CustomFieldsAdmin({ fields }: { fields: CustomFieldDef[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", type: "text" as CustomFieldType, options: "", sensitivity: "standard" as Sensitivity, helpText: "", required: false });
  const [editing, setEditing] = useState<string | null>(null);

  const needsOptions = draft.type === "select" || draft.type === "multi_select";

  return (
    <div className="grid max-w-4xl gap-8">
      <form
        className="grid gap-3 rounded-lg border border-line-soft p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const created = await createCustomFieldAction({
              label: draft.label, type: draft.type, options: parseOptions(draft.options), sensitivity: draft.sensitivity,
              helpText: draft.helpText || null, required: draft.required,
            });
            if (!created.ok) return setError(created.error);
            setError(null);
            setNotice(`Added “${draft.label}”. It's now a column in the student grid.`);
            setDraft({ label: "", type: "text", options: "", sensitivity: "standard", helpText: "", required: false });
            router.refresh();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Add a field</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="voice text-xs text-ink-muted">name</span>
            <input required value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Dismissal" className="h-9 rounded-md border border-line bg-surface px-2" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="voice text-xs text-ink-muted">kind of answer</span>
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CustomFieldType })} className="h-9 rounded-md border border-line bg-surface px-2">
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {needsOptions && (
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="voice text-xs text-ink-muted">choices, separated by commas</span>
              <input required value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} placeholder="Parent pickup, Self-dismiss" className="h-9 rounded-md border border-line bg-surface px-2" />
            </label>
          )}
          <label className="grid gap-1 text-sm">
            <span className="voice text-xs text-ink-muted">who can see it</span>
            <select value={draft.sensitivity} onChange={(e) => setDraft({ ...draft, sensitivity: e.target.value as Sensitivity })} className="h-9 rounded-md border border-line bg-surface px-2">
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}: {l.note}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="voice text-xs text-ink-muted">help text (optional)</span>
            <input value={draft.helpText} onChange={(e) => setDraft({ ...draft, helpText: e.target.value })} className="h-9 rounded-md border border-line bg-surface px-2" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
          Can&apos;t be left empty once set
        </label>
        <button type="submit" disabled={pending} className="h-9 w-fit rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-60">Add field</button>
      </form>

      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      {notice && !error && <p role="status" className="text-sm text-ink-muted">{notice}</p>}

      <section aria-labelledby="fields-h" className="grid gap-3">
        <h2 id="fields-h" className="text-lg font-semibold">Fields</h2>
        {fields.length === 0 && <p className="voice text-sm text-ink-muted">no custom fields yet.</p>}
        <ul className="grid gap-2">
          {fields.map((f) => (
            <li key={f.id} className={`rounded-lg border border-line-soft p-3 ${f.archived ? "opacity-60" : ""}`}>
              {editing === f.id ? (
                <EditField field={f} onDone={() => setEditing(null)} onSaved={(msg) => { setNotice(msg); setError(null); router.refresh(); }} onError={setError} />
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-semibold text-ink-title">{f.label}</span>
                  <span className="voice text-xs text-ink-muted">
                    {[TYPE_LABEL[f.type].toLowerCase(), f.sensitivity, f.required && "required", f.archived && "archived", f.options.length > 0 && f.options.join(" · ")].filter(Boolean).join(" · ")}
                  </span>
                  <button type="button" onClick={() => setEditing(f.id)} className="ml-auto text-sm text-link hover:underline">Edit</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function EditField({ field, onDone, onSaved, onError }: { field: CustomFieldDef; onDone: () => void; onSaved: (m: string) => void; onError: (m: string) => void }) {
  const [label, setLabel] = useState(field.label);
  const [options, setOptions] = useState(field.options.join(", "));
  const [sensitivity, setSensitivity] = useState(field.sensitivity);
  const [helpText, setHelpText] = useState(field.helpText ?? "");
  const [required, setRequired] = useState(field.required);
  const [pending, start] = useTransition();
  const save = (archived: boolean) =>
    start(async () => {
      const saved = await updateCustomFieldAction({ id: field.id, label, options: parseOptions(options), sensitivity, helpText: helpText || null, required, archived });
      if (!saved.ok) return onError(saved.error);
      onSaved(archived && !field.archived ? `Archived “${label}”. Its values are kept.` : `Saved “${label}”.`);
      onDone();
    });
  return (
    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); save(field.archived); }} onKeyDown={(e) => e.key === "Escape" && onDone()}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">name</span>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2" /></label>
        <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">who can see it</span>
          <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as Sensitivity)} className="h-9 rounded-md border border-line bg-surface px-2">
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}: {l.note}</option>)}
          </select></label>
        {(field.type === "select" || field.type === "multi_select") && (
          <label className="grid gap-1 text-sm sm:col-span-2"><span className="voice text-xs text-ink-muted">choices, separated by commas</span>
            <input value={options} onChange={(e) => setOptions(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2" /></label>
        )}
        <label className="grid gap-1 text-sm sm:col-span-2"><span className="voice text-xs text-ink-muted">help text</span>
          <input value={helpText} onChange={(e) => setHelpText(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Can&apos;t be left empty once set</label>
      <p className="voice text-xs text-ink-muted">the kind of answer can&apos;t change once a field exists.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface">Save</button>
        <button type="button" disabled={pending} onClick={() => save(!field.archived)} className="h-9 rounded-md border border-line px-3 text-sm">{field.archived ? "Restore" : "Archive"}</button>
        <button type="button" onClick={onDone} className="voice px-2 text-xs text-ink-muted">esc to cancel</button>
      </div>
    </form>
  );
}
