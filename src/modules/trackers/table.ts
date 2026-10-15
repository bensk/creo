import { and, asc, eq, isNull } from "drizzle-orm";
import { sensitiveReads } from "@/core/audit/schema";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import type { Sensitivity } from "@/core/permissions/sensitivity";
import { describeSource, runQuery } from "@/core/query/run";
import { levelsEverywhere } from "@/core/sharing/access";
import { rosterFor } from "../students/queries";
import type { TrackerRow } from "./model";
import { trackerFields, trackerRows } from "./schema";

export interface TrackerColumn {
  key: string;
  label: string;
  type: string;
  options: string[];
  sensitivity: Sensitivity;
  editable: boolean;
  /** Blank for some students because the viewer can't see this field for them (computed, assigned-only). */
  partial: boolean;
}

export interface TrackerTableRow {
  rowId: string;
  version: number;
  studentId: string;
  name: { legalFirstName: string; legalLastName: string; preferredFirstName: string | null; preferredLastName: string | null };
  grade: number | null;
  phonetic: string | null;
  values: Record<string, unknown>;
}

/**
 * A tracker's table as this viewer may see it. Computed columns run through
 * the query engine as the viewer; typed columns above standard sensitivity
 * are shown only to the owner and to roles that see that level everywhere.
 */
export async function loadTrackerTable(db: Db, viewer: StaffViewer, tracker: TrackerRow, editable: boolean): Promise<{ columns: TrackerColumn[]; rows: TrackerTableRow[] }> {
  const fields = await db.select().from(trackerFields).where(and(eq(trackerFields.trackerId, tracker.id), isNull(trackerFields.archivedAt))).orderBy(asc(trackerFields.position));
  const rows = await db.select().from(trackerRows).where(and(eq(trackerRows.trackerId, tracker.id), isNull(trackerRows.archivedOn)));
  const ids = rows.map((r) => r.studentId);
  const roster = new Map((await rosterFor(db, viewer.schoolId, ids)).map((r) => [r.id, r]));

  const levels = levelsEverywhere(viewer.roles);
  const isOwner = tracker.ownerStaffId === viewer.staffId;
  const visibleManual = fields.filter((f) => f.type !== "computed" && (f.sensitivity === "standard" || isOwner || levels.has(f.sensitivity as Sensitivity)));
  const computed = fields.filter((f) => f.type === "computed");

  // Computed values: one query per "since" date, run as the viewer.
  const computedValues = new Map<string, Map<string, unknown>>(); // field key → student → value
  const partial = new Set<string>();
  const allowed = new Map((await describeSource(db, viewer, "students")).map((c) => [c.key, c]));
  const bySince = new Map<string, typeof computed>();
  for (const f of computed) {
    const spec = f.computed as { field: string; since: string | null };
    if (!allowed.has(spec.field)) continue; // the viewer can't see this field at all
    const k = spec.since ?? "";
    bySince.set(k, [...(bySince.get(k) ?? []), f]);
  }
  for (const [since, group] of bySince) {
    if (!ids.length) break;
    const result = await runQuery(db, viewer, {
      source: "students", columns: group.map((f) => (f.computed as { field: string }).field),
      filters: [{ field: "id", op: "in", value: ids }], limit: 2000,
    }, since ? { schoolYearStart: since } : undefined);
    for (const f of group) {
      const field = (f.computed as { field: string }).field;
      if (result.columns.find((c) => c.key === field)?.partial) partial.add(f.key);
      computedValues.set(f.key, new Map(result.rows.map((r) => [r.id, r.values[field]])));
    }
  }

  const shownSensitive = visibleManual.filter((f) => f.sensitivity !== "standard");
  if (shownSensitive.length && rows.length) {
    await db.insert(sensitiveReads).values(shownSensitive.map((f) => ({
      schoolId: viewer.schoolId, actorUserId: viewer.userId, entity: "trackers", entityId: tracker.id, field: f.key, via: "app" as const,
    })));
  }

  const columns: TrackerColumn[] = [
    ...fields.filter((f) => visibleManual.includes(f) || computedValues.has(f.key)).map((f) => ({
      key: f.key, label: f.label, type: f.type, options: f.options, sensitivity: f.sensitivity as Sensitivity,
      editable: editable && f.type !== "computed" && !tracker.archivedAt, partial: partial.has(f.key),
    })),
  ];
  const out: TrackerTableRow[] = rows.flatMap((r) => {
    const s = roster.get(r.studentId);
    if (!s) return [];
    const data = r.data as Record<string, unknown>;
    const values: Record<string, unknown> = {};
    for (const c of columns) values[c.key] = c.type === "computed" ? (computedValues.get(c.key)?.get(r.studentId) ?? null) : (data[c.key] ?? null);
    return [{
      rowId: r.id, version: r.version, studentId: r.studentId, grade: s.grade, phonetic: s.phonetic, values,
      name: { legalFirstName: s.legalFirstName, legalLastName: s.legalLastName, preferredFirstName: s.preferredFirstName, preferredLastName: s.preferredLastName },
    }];
  }).sort((a, b) => `${a.name.legalLastName} ${a.name.legalFirstName}`.localeCompare(`${b.name.legalLastName} ${b.name.legalFirstName}`));
  return { columns, rows: out };
}
