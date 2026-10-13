"use client";

import {
  DataEditor,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Theme,
  CompactSelection,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CompiledColumn } from "@/core/query/compile";
import type { QueryResult } from "@/core/query/run";
import { OPERATORS_BY_TYPE } from "@/core/query/source";
import type { Filter, Operator, QuerySpecInput } from "@/core/query/spec";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";
import {
  bulkUpdateStudentsAction, deleteStudentViewAction, queryStudentsAction, saveStudentViewAction, updateStudentCellAction,
} from "../grid-actions";
import { readGridTheme } from "./grid-theme";

export interface SavedView {
  id: string;
  name: string;
  spec: unknown;
  sharing: string;
  mine: boolean;
}

const BUILT_IN_EDITABLE = new Set(["preferredFirstName", "pronouns", "medicalAlert", "mediaConsent"]);
// Built-in editable fields and every custom field; the server decides per student.
const isEditable = (key: string) => BUILT_IN_EDITABLE.has(key) || key.startsWith("custom.");
const OP_LABEL: Record<Operator, string> = {
  eq: "is", neq: "is not", in: "is any of", not_in: "is none of", contains: "contains", starts_with: "starts with",
  gt: ">", gte: "≥", lt: "<", lte: "≤", between: "between", is_empty: "is empty", is_not_empty: "is not empty",
  is_true: "is yes", is_false: "is no",
};
const NO_VALUE = new Set<Operator>(["is_empty", "is_not_empty", "is_true", "is_false"]);

function display(column: CompiledColumn, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (column.type === "percent") return `${Number(value).toFixed(1)}%`;
  if (column.type === "boolean") return value ? "Yes" : "No";
  if (column.type === "text_list") return (value as string[]).join(", ");
  if (column.type === "date") return String(value).slice(0, 10);
  if (column.key === "mediaConsent") return value === "ask_first" ? "ask first" : String(value);
  return String(value);
}

function describeFilter(filter: Filter, fields: CompiledColumn[]): string {
  const label = fields.find((f) => f.key === filter.field)?.label ?? filter.field;
  if (NO_VALUE.has(filter.op)) return `${label} ${OP_LABEL[filter.op]}`;
  const value = Array.isArray(filter.value) ? filter.value.join(filter.op === "between" ? " and " : ", ") : String(filter.value);
  return `${label} ${OP_LABEL[filter.op]} ${value}`;
}

export function StudentGrid({
  fields,
  initialSpec,
  initialResult,
  initialViews,
  userCanEdit,
  canManageFields,
}: {
  fields: CompiledColumn[];
  initialSpec: QuerySpecInput & { columns: string[] };
  initialResult: QueryResult;
  initialViews: SavedView[];
  userCanEdit: boolean;
  canManageFields: boolean;
}) {
  const router = useRouter();
  const [spec, setSpec] = useState(initialSpec);
  const [result, setResult] = useState(initialResult);
  const [views, setViews] = useState(initialViews);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<"filter" | "columns" | "views" | "bulk" | null>(null);
  const [loading, startLoading] = useTransition();
  const [theme, setTheme] = useState<Partial<Theme>>({});
  const gridRef = useRef<DataEditorRef>(null);
  const [selection, setSelection] = useState<GridSelection>({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
  const searchRef = useRef<HTMLInputElement>(null);
  const firstRun = useRef(true);

  // Follow light/dark changes (system or the theme switch).
  useEffect(() => {
    const apply = () => setTheme(readGridTheme());
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", apply);
      observer.disconnect();
    };
  }, []);

  // Re-run the query whenever the spec changes (search is debounced).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      startLoading(async () => {
        const next = await queryStudentsAction(spec);
        if (next.ok) {
          setResult(next.data);
          setError(null);
        } else setError(next.error);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [spec]);

  const columns = result.columns;
  const gridColumns: GridColumn[] = useMemo(
    () =>
      columns.map((c) => ({
        id: c.key,
        title: c.label + (c.partial ? " *" : ""),
        width: c.key === "name" ? 200 : c.key === "medicalAlert" ? 260 : c.type === "boolean" || c.type === "number" ? 110 : 150,
      })),
    [columns],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const column = columns[col]!;
      const value = result.rows[row]?.values[column.key];
      const text = display(column, value);
      if (column.key === "name") {
        return { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: false, readonly: true, cursor: "pointer" };
      }
      if ((column.type === "number" || column.type === "percent") && value !== null && value !== undefined) {
        return { kind: GridCellKind.Number, data: Number(value), displayData: text, allowOverlay: false, readonly: true, contentAlign: "right" };
      }
      const editable = userCanEdit && isEditable(column.key);
      const data = value === null || value === undefined ? "" : column.type === "boolean" || column.type === "text_list" ? text : String(value);
      return { kind: GridCellKind.Text, data, displayData: text, allowOverlay: editable, readonly: !editable };
    },
    [columns, result.rows, userCanEdit],
  );

  const onCellEdited = useCallback(
    async ([col, row]: Item, cell: EditableGridCell) => {
      const column = columns[col]!;
      const target = result.rows[row];
      if (!target || cell.kind !== GridCellKind.Text || target.version === null) return;
      const previous = target.values[column.key];
      const nextValue = cell.data.trim() === "" ? null : cell.data.trim();
      // Optimistic: show the change now, put it back if the server says no.
      setResult((r) => ({ ...r, rows: r.rows.map((x, i) => (i === row ? { ...x, values: { ...x.values, [column.key]: nextValue } } : x)) }));
      const saved = await updateStudentCellAction({ studentId: target.id, version: target.version, field: column.key as never, value: nextValue });
      if (saved.ok) {
        setResult((r) => ({ ...r, rows: r.rows.map((x, i) => (i === row ? { ...x, version: saved.data.version } : x)) }));
        setNotice(`Saved “${column.label}”.`);
        setError(null);
      } else {
        setResult((r) => ({ ...r, rows: r.rows.map((x, i) => (i === row ? { ...x, values: { ...x.values, [column.key]: previous } } : x)) }));
        setError(saved.error);
      }
    },
    [columns, result.rows],
  );

  const openStudent = (row: number) => {
    const target = result.rows[row];
    if (target) router.push(`/students/${target.id}`);
  };

  const selectedRow = selection.current?.cell[1] ?? -1;
  const checkedRows = selection.rows.toArray();
  const moveRow = (delta: number) => {
    const row = Math.max(0, Math.min(result.rows.length - 1, selectedRow + delta));
    setSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty(), current: { cell: [0, row], range: { x: 0, y: row, width: 1, height: 1 }, rangeStack: [] } });
  };
  useShortcut({ keys: "j", description: "Next student", group: "This screen", run: () => moveRow(1) });
  useShortcut({ keys: "k", description: "Previous student", group: "This screen", run: () => moveRow(-1) });
  useShortcut({ keys: "o", description: "Open the selected student", group: "This screen", run: () => selectedRow >= 0 && openStudent(selectedRow) });
  useShortcut({ keys: "f", description: "Add a filter", group: "This screen", run: () => setPanel("filter") });
  useShortcut({ keys: "c", description: "Choose columns", group: "This screen", run: () => setPanel("columns") });

  const setColumns = (keys: string[]) => setSpec((s) => ({ ...s, columns: keys }));
  const removeFilter = (i: number) => setSpec((s) => ({ ...s, filters: (s.filters ?? []).filter((_, j) => j !== i) }));

  const applyView = (view: SavedView) => {
    const v = view.spec as QuerySpecInput & { columns?: string[] };
    setSpec({ ...v, columns: v.columns ?? initialSpec.columns, source: "students" });
    setPanel(null);
    setNotice(`Showing “${view.name}”.`);
  };

  return (
    <div className="grid h-[calc(100dvh-7rem)] grid-rows-[auto_auto_1fr] gap-3 md:h-[calc(100dvh-5rem)]">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="student-search" className="sr-only">Search students</label>
        <input
          id="student-search"
          ref={searchRef}
          data-screen-search
          type="search"
          value={spec.search ?? ""}
          onChange={(e) => setSpec((s) => ({ ...s, search: e.target.value }))}
          placeholder="search by name…"
          className="voice h-9 w-64 rounded-md border border-line bg-surface px-3 text-sm text-ink-title placeholder:text-ink-muted"
        />
        <ToolbarButton active={panel === "filter"} onClick={() => setPanel(panel === "filter" ? null : "filter")} hint="f">Filter</ToolbarButton>
        <ToolbarButton active={panel === "columns"} onClick={() => setPanel(panel === "columns" ? null : "columns")} hint="c">Columns</ToolbarButton>
        <ToolbarButton active={panel === "views"} onClick={() => setPanel(panel === "views" ? null : "views")}>Views</ToolbarButton>
        {userCanEdit && checkedRows.length > 0 && (
          <ToolbarButton active={panel === "bulk"} onClick={() => setPanel(panel === "bulk" ? null : "bulk")}>
            Edit {checkedRows.length} selected
          </ToolbarButton>
        )}
        {canManageFields && (
          <Link href="/students/fields" className="flex h-9 items-center rounded-md px-2 text-sm text-link hover:underline">Fields</Link>
        )}
        <span className="voice ml-auto text-xs text-ink-muted" aria-live="polite">
          {loading ? "loading…" : `${result.rows.length} ${result.rows.length === 1 ? "student" : "students"}`}
        </span>
      </div>

      <div className="grid gap-2">
        {(spec.filters ?? []).length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Filters">
            {(spec.filters ?? []).map((f, i) => (
              <li key={i} className="flex items-center gap-1 rounded-full border border-line-soft bg-surface-raised py-0.5 pl-3 pr-1 text-sm">
                {describeFilter(f as Filter, fields)}
                <button type="button" onClick={() => removeFilter(i)} aria-label={`Remove filter: ${describeFilter(f as Filter, fields)}`} className="rounded-full px-1.5 text-ink-muted hover:text-ink-title">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {panel === "filter" && (
          <FilterPanel
            fields={fields.filter((f) => !f.partial)}
            onAdd={(filter) => {
              setSpec((s) => ({ ...s, filters: [...(s.filters ?? []), filter] }));
              setPanel(null);
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === "columns" && <ColumnPanel fields={fields} selected={spec.columns} onChange={setColumns} />}
        {panel === "views" && (
          <ViewPanel
            views={views}
            onApply={applyView}
            onSave={async (name, shared) => {
              const saved = await saveStudentViewAction({ name, spec: { ...spec, source: "students" }, sharing: shared ? "school" : "private" });
              if (!saved.ok) return setError(saved.error);
              setViews((v) => [...v, { id: saved.data.id, name, spec, sharing: shared ? "school" : "private", mine: true }].sort((a, b) => a.name.localeCompare(b.name)));
              setNotice(`Saved view “${name}”.`);
            }}
            onDelete={async (view) => {
              const deleted = await deleteStudentViewAction(view.id);
              if (!deleted.ok) return setError(deleted.error);
              setViews((v) => v.filter((x) => x.id !== view.id));
            }}
          />
        )}
        {panel === "bulk" && checkedRows.length > 0 && (
          <BulkPanel
            fields={fields.filter((f) => isEditable(f.key))}
            count={checkedRows.length}
            onClose={() => setPanel(null)}
            onApply={async (fieldKey, value) => {
              const rows = checkedRows.map((i) => result.rows[i]).filter((r): r is NonNullable<typeof r> => !!r && r.version !== null);
              const saved = await bulkUpdateStudentsAction({ field: fieldKey, value, rows: rows.map((r) => ({ studentId: r.id, version: r.version! })) });
              if (!saved.ok) return setError(saved.error);
              const label = fields.find((f) => f.key === fieldKey)?.label ?? fieldKey;
              const reasons = [...new Set(saved.data.skipped.map((x) => x.reason))];
              if (saved.data.skipped.length > 0) setError(`Saved ${saved.data.updated.length}. Skipped ${saved.data.skipped.length}: ${reasons.join(" ")}`);
              else setError(null);
              setNotice(`Saved “${label}” for ${saved.data.updated.length} ${saved.data.updated.length === 1 ? "student" : "students"}.`);
              setPanel(null);
              setSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
              // Reload so values and versions are exactly what the server has.
              const next = await queryStudentsAction(spec);
              if (next.ok) setResult(next.data);
            }}
          />
        )}
        {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
        {/* Plain text: notices can quote names staff wrote (views, fields), which never use the system voice. */}
        {notice && !error && <p role="status" className="text-xs text-ink-muted">{notice}</p>}
        {columns.some((c) => c.partial) && (
          <p className="voice text-xs text-ink-muted">* shown only for students you work with.</p>
        )}
      </div>

      <div className="min-h-0 overflow-hidden rounded-lg border border-line-soft" data-testid="student-grid">
        <DataEditor
          columns={gridColumns}
          rows={result.rows.length}
          getCellContent={getCellContent}
          getCellsForSelection
          ref={gridRef}
          onCellEdited={onCellEdited}
          // Glide selects the cell but leaves focus where it was (e.g. the
          // search box), so keys would go there. Clicking a cell moves focus in.
          onCellClicked={() => gridRef.current?.focus()}
          onCellActivated={([col, row]) => {
            if (columns[col]?.key === "name") openStudent(row);
          }}
          gridSelection={selection}
          onGridSelectionChange={setSelection}
          rowMarkers={userCanEdit ? { kind: "checkbox-visible", checkboxStyle: "square" } : "number"}
          rowMarkerWidth={44}
          rowSelect="multi"
          rowSelectionMode="multi"
          smoothScrollX
          smoothScrollY
          width="100%"
          height="100%"
          theme={theme}
        />
      </div>
    </div>
  );
}

function ToolbarButton({ active, onClick, hint, children }: { active: boolean; onClick: () => void; hint?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-md border border-line-soft px-3 text-sm hover:bg-surface-raised aria-pressed:border-line aria-pressed:bg-surface-raised aria-pressed:text-ink-title"
    >
      {children}
      {hint && <kbd className="kbd">{hint.toUpperCase()}</kbd>}
    </button>
  );
}

function FilterPanel({ fields, onAdd, onClose }: { fields: CompiledColumn[]; onAdd: (f: Filter) => void; onClose: () => void }) {
  const [fieldKey, setFieldKey] = useState(fields[0]?.key ?? "");
  const field = fields.find((f) => f.key === fieldKey);
  const ops = field ? OPERATORS_BY_TYPE[field.type] : [];
  const [op, setOp] = useState<Operator>(ops[0] ?? "eq");
  const [value, setValue] = useState("");

  const parse = (raw: string): unknown => {
    const one = (s: string) => (field?.type === "number" || field?.type === "percent" ? Number(s) : s.trim());
    if (op === "in" || op === "not_in") return raw.split(",").map(one).filter((x) => x !== "");
    if (op === "between") return raw.split(/,|\band\b/).map(one).slice(0, 2);
    return one(raw);
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border border-line-soft bg-surface-raised p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!field) return;
        onAdd({ field: field.key, op, ...(NO_VALUE.has(op) ? {} : { value: parse(value) }) });
      }}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <label className="grid gap-1 text-xs">
        <span className="voice text-ink-muted">field</span>
        <select
          autoFocus
          value={fieldKey}
          onChange={(e) => {
            setFieldKey(e.target.value);
            const next = fields.find((f) => f.key === e.target.value);
            setOp((OPERATORS_BY_TYPE[next?.type ?? "text"][0] ?? "eq") as Operator);
            setValue("");
          }} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        <span className="voice text-ink-muted">condition</span>
        <select value={op} onChange={(e) => setOp(e.target.value as Operator)} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
          {ops.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
        </select>
      </label>
      {!NO_VALUE.has(op) && (
        <label className="grid gap-1 text-xs">
          <span className="voice text-ink-muted">{op === "in" || op === "not_in" ? "values, separated by commas" : op === "between" ? "from, to" : "value"}</span>
          {field?.type === "enum" && op !== "in" && op !== "not_in" ? (
            <select value={value} onChange={(e) => setValue(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
              <option value="" />
              {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input value={value} onChange={(e) => setValue(e.target.value)} type={field?.type === "date" && op !== "between" ? "date" : "text"} className="h-9 w-48 rounded-md border border-line bg-surface px-2 text-sm" />
          )}
        </label>
      )}
      <button type="submit" className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface">Add filter</button>
      <button type="button" onClick={onClose} className="voice h-9 px-2 text-xs text-ink-muted">esc to close</button>
    </form>
  );
}

function ColumnPanel({ fields, selected, onChange }: { fields: CompiledColumn[]; selected: string[]; onChange: (keys: string[]) => void }) {
  const groups = [...new Set(fields.map((f) => f.group))];
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : fields.map((f) => f.key).filter((k) => k === key || selected.includes(k)));
  return (
    <fieldset className="grid gap-3 rounded-lg border border-line-soft bg-surface-raised p-3 sm:grid-cols-3 lg:grid-cols-5">
      <legend className="sr-only">Columns</legend>
      {groups.map((g) => (
        <div key={g} className="grid content-start gap-1">
          <span className="voice text-xs text-ink-muted">{g.toLowerCase()}</span>
          {fields.filter((f) => f.group === g).map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(f.key)} disabled={f.key === "name"} onChange={() => toggle(f.key)} />
              {f.label}
              {f.partial && <span className="voice text-xs text-ink-muted">your students</span>}
            </label>
          ))}
        </div>
      ))}
    </fieldset>
  );
}

function ViewPanel({
  views, onApply, onSave, onDelete,
}: {
  views: SavedView[];
  onApply: (v: SavedView) => void;
  onSave: (name: string, shared: boolean) => void;
  onDelete: (v: SavedView) => void;
}) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  return (
    <div className="grid gap-3 rounded-lg border border-line-soft bg-surface-raised p-3 md:grid-cols-2">
      <div className="grid content-start gap-1">
        <span className="voice text-xs text-ink-muted">saved views</span>
        {views.length === 0 && <span className="voice text-sm text-ink-muted">none yet. save the current filters and columns.</span>}
        <ul className="grid gap-1">
          {views.map((v) => (
            <li key={v.id} className="flex items-center gap-2">
              <button type="button" onClick={() => onApply(v)} className="text-left text-sm text-link hover:underline">{v.name}</button>
              <span className="voice text-xs text-ink-muted">{v.sharing === "school" ? "shared" : "private"}</span>
              {v.mine && (
                <button type="button" onClick={() => onDelete(v)} className="voice ml-auto text-xs text-ink-muted hover:text-ink-title" aria-label={`Delete view ${v.name}`}>
                  delete
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <form
        className="grid content-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim(), shared);
          setName("");
        }}
      >
        <label className="grid gap-1 text-xs">
          <span className="voice text-ink-muted">save current view as</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 7th grade, under 90%" className="h-9 rounded-md border border-line bg-surface px-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share with all staff <span className="voice text-xs text-ink-muted">they still see only what they&apos;re allowed to</span>
        </label>
        <button type="submit" className="h-9 w-fit rounded-md bg-ink-title px-4 text-sm font-semibold text-surface">Save view</button>
      </form>
    </div>
  );
}

function BulkPanel({
  fields, count, onApply, onClose,
}: {
  fields: CompiledColumn[];
  count: number;
  onApply: (field: string, value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [fieldKey, setFieldKey] = useState(fields[0]?.key ?? "");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const field = fields.find((f) => f.key === fieldKey);
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border border-line-soft bg-surface-raised p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onApply(fieldKey, value);
        setSaving(false);
      }}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <span className="voice self-center text-sm text-ink-muted">set for {count} {count === 1 ? "student" : "students"}:</span>
      <label className="grid gap-1 text-xs">
        <span className="voice text-ink-muted">field</span>
        <select autoFocus value={fieldKey} onChange={(e) => { setFieldKey(e.target.value); setValue(""); }} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        <span className="voice text-ink-muted">{field?.type === "text_list" ? "values, separated by commas" : "new value (empty clears it)"}</span>
        {field?.type === "enum" && field.options ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">(clear)</option>
            {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : field?.type === "boolean" ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">(clear)</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        ) : (
          <input value={value} onChange={(e) => setValue(e.target.value)} type={field?.type === "date" ? "date" : "text"} className="h-9 w-56 rounded-md border border-line bg-surface px-2 text-sm" />
        )}
      </label>
      <button type="submit" disabled={saving} className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-60">
        {saving ? "Saving…" : `Apply to ${count}`}
      </button>
      <button type="button" onClick={onClose} className="voice h-9 px-2 text-xs text-ink-muted">esc to close</button>
    </form>
  );
}
