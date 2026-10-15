"use client";

import {
  CompactSelection, DataEditor, GridCellKind,
  type DataEditorRef, type EditableGridCell, type GridCell, type GridColumn, type GridSelection, type Item, type Theme,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readGridTheme } from "@/core/ui/grid-theme";
import { displayName } from "@/core/ui/StudentName";
import { removeTrackerRowAction, setTrackerCellAction, trackerRowsAction } from "../actions";
import { evaluateRule } from "../rules";
import type { TrackerColumn, TrackerTableRow } from "../table";

const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function show(c: TrackerColumn, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (c.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return date.format(new Date(`${v}T00:00:00Z`));
  if (typeof v === "number" && c.type === "computed" && !Number.isInteger(v)) return v.toFixed(1);
  return String(v);
}

/** A tracker as a sheet: arrow keys move, Enter or typing edits, Space toggles yes/no, edits save cell by cell. */
export function TrackerGrid({ trackerId, viewerUserId, columns, initialRows, editable, snapshot }: {
  trackerId: string;
  /** To skip live notices for the viewer's own edits. */
  viewerUserId: string;
  columns: TrackerColumn[];
  initialRows: TrackerTableRow[];
  editable: boolean;
  snapshot: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [theme, setTheme] = useState<Partial<Theme>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<GridSelection>({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
  const gridRef = useRef<DataEditorRef>(null);
  // New rows from the server (after adding or removing students) replace local ones.
  const [prevInitial, setPrevInitial] = useState(initialRows);
  if (initialRows !== prevInitial) {
    setPrevInitial(initialRows);
    setRows(initialRows);
  }

  // Live updates: someone else's edits arrive as row ids; re-read just those rows
  // (as this viewer may see them). A change of shape (columns, who's on it) reloads the page data.
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  useEffect(() => {
    const events = new EventSource(`/trackers/${trackerId}/events`);
    events.onopen = () => setLive("live");
    events.onerror = () => setLive("offline");
    events.onmessage = async (e) => {
      const notice = JSON.parse(e.data) as { rowIds: string[]; by: string };
      if (notice.by === viewerUserId) return;
      if (notice.rowIds.length === 0) return router.refresh();
      const fresh = await trackerRowsAction(trackerId, notice.rowIds);
      if (!fresh) return;
      const byId = new Map(fresh.map((r) => [r.rowId, r]));
      setRows((rs) => rs.flatMap((r) => (notice.rowIds.includes(r.rowId) ? (byId.has(r.rowId) ? [byId.get(r.rowId)!] : []) : [r])));
      setNotice("Updated with someone else's change.");
    };
    return () => events.close();
  }, [trackerId, viewerUserId, router]);

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

  const gridColumns: GridColumn[] = useMemo(() => [
    { id: "name", title: "Name", width: 220 },
    { id: "grade", title: "Grade", width: 70 },
    ...columns.map((c) => ({ id: c.key, title: `${c.label}${c.partial ? " *" : ""}`, width: c.type === "boolean" ? 110 : c.type === "long_text" || c.type === "rule" ? 280 : 170 })),
  ], [columns]);

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const r = rows[row]!;
    if (col === 0) {
      const text = `${displayName(r.name)}${r.phonetic ? `  (${r.phonetic})` : ""}`;
      return { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: false, readonly: true };
    }
    if (col === 1) return { kind: GridCellKind.Number, data: r.grade ?? undefined, displayData: r.grade ? String(r.grade) : "", allowOverlay: false, readonly: true };
    const c = columns[col - 2]!;
    const v = r.values[c.key];
    if (c.type === "rule") {
      const text = v === true ? "Yes" : `No: ${(r.missing[c.key] ?? []).join("; ")}`;
      return { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: true, readonly: true, themeOverride: v === true ? undefined : { textDark: theme.textMedium } };
    }
    if (c.type === "boolean") return { kind: GridCellKind.Boolean, data: v === true ? true : v === false ? false : null, allowOverlay: false, readonly: !c.editable };
    const text = show(c, v);
    const data = Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : String(v);
    return { kind: GridCellKind.Text, data, displayData: text, allowOverlay: c.editable, readonly: !c.editable };
  }, [rows, columns, theme]);

  const labels = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c.label])), [columns]);
  /** Rule answers for a row after a value changes, worked out the same way as on the server. */
  const withRules = useCallback((x: TrackerTableRow, values: Record<string, unknown>): TrackerTableRow => {
    const next = { ...values };
    const missing: Record<string, string[]> = {};
    for (const c of columns) {
      if (!c.rule) continue;
      const result = evaluateRule(c.rule, next, labels);
      next[c.key] = result.pass;
      if (!result.pass) missing[c.key] = result.missing;
    }
    return { ...x, values: next, missing };
  }, [columns, labels]);

  const onCellEdited = useCallback(async ([col, row]: Item, cell: EditableGridCell) => {
    const c = columns[col - 2];
    const r = rows[row];
    if (!c || !r || !c.editable) return;
    const value = cell.kind === GridCellKind.Boolean ? cell.data : cell.kind === GridCellKind.Text ? cell.data : null;
    const previous = r.values[c.key];
    setRows((rs) => rs.map((x, i) => (i === row ? withRules(x, { ...x.values, [c.key]: value }) : x)));
    const saved = await setTrackerCellAction({ trackerId, rowId: r.rowId, key: c.key, value, expected: previous });
    if (saved.ok) {
      setRows((rs) => rs.map((x, i) => (i === row ? { ...withRules(x, { ...x.values, [c.key]: saved.data.value }), version: saved.data.version } : x)));
      setNotice(`Saved “${c.label}”.`);
      setError(null);
    } else {
      // Put back only this cell, and only if nothing newer has been typed into it since.
      setRows((rs) => rs.map((x, i) => (i === row && x.values[c.key] === value ? withRules(x, { ...x.values, [c.key]: previous }) : x)));
      setError(saved.error);
    }
  }, [columns, rows, trackerId, withRules]);

  const ticked = selection.rows.toArray();

  return (
    <div className="grid gap-2">
      <div className="flex min-h-6 flex-wrap items-center gap-3 text-sm">
        {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-1">{error}</p>}
        {notice && !error && <p role="status" className="text-ink-muted">{notice}</p>}
        {editable && snapshot && ticked.length > 0 && (
          <button type="button" className="h-8 rounded-md border border-line px-3"
            onClick={async () => {
              for (const i of ticked) {
                const r = rows[i];
                if (r) await removeTrackerRowAction(trackerId, r.rowId);
              }
              setSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
              router.refresh();
            }}>
            Remove {ticked.length} from tracker
          </button>
        )}
        {columns.some((c) => c.partial) && <span className="voice text-xs text-ink-muted">* shown only for students you work with.</span>}
        <span className="voice ml-auto text-xs text-ink-muted" aria-live="polite">{live === "live" ? "live" : live === "offline" ? "reconnecting…" : ""}</span>
      </div>
      <div
        className="h-[min(70dvh,calc(36px+34px*var(--rows)))] min-h-40 overflow-hidden rounded-lg border border-line-soft"
        style={{ ["--rows" as string]: Math.max(rows.length, 3) }}
        data-testid="tracker-grid"
        // Space belongs to the grid (Glide toggles yes/no cells with it), not to page scrolling.
        onKeyDown={(e) => { if (e.key === " " && (e.target as HTMLElement).tagName === "CANVAS") e.preventDefault(); }}
      >
        <DataEditor
          ref={gridRef}
          columns={gridColumns}
          rows={rows.length}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          onCellClicked={() => gridRef.current?.focus()}
          onCellActivated={([col, row]) => { if (col === 0 && rows[row]) router.push(`/students/${rows[row].studentId}`); }}
          gridSelection={selection}
          onGridSelectionChange={setSelection}
          rowMarkers={editable && snapshot ? { kind: "checkbox-visible", checkboxStyle: "square" } : "number"}
          rowMarkerWidth={44}
          rowSelect="multi"
          rowSelectionMode="multi"
          freezeColumns={1}
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
