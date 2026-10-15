import { z } from "zod";
import { recordAudit } from "@/core/audit/record";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { displayName } from "@/core/ui/StudentName";
import { canEdit, getTracker } from "@/modules/trackers/access";
import { loadTrackerTable } from "@/modules/trackers/table";

// A tracker as CSV: the columns the person downloading may see, and nothing
// else. Every export is audited (CLAUDE.md: all exports are logged).
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("staff");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const db = getDb();
  const found = await getTracker(db, viewer, id);
  if (!found) return new Response("Not found", { status: 404 });
  const table = await loadTrackerTable(db, viewer, found.tracker, canEdit(found.access));
  const lines = [
    ["Name", "Grade", ...table.columns.map((c) => c.label)].map(cell).join(","),
    ...table.rows.map((r) => [displayName(r.name), r.grade, ...table.columns.map((c) =>
      c.type === "rule" ? (r.values[c.key] === true ? "Yes" : `No: ${(r.missing[c.key] ?? []).join("; ")}`) : r.values[c.key])].map(cell).join(",")),
  ];
  await recordAudit(db, {
    schoolId: viewer.schoolId, actorUserId: viewer.userId, action: "tracker.export", entity: "trackers", entityId: found.tracker.id,
    after: { rows: table.rows.length, columns: table.columns.map((c) => c.key) }, via: "app",
  });
  const filename = `${found.tracker.name.replace(/[^\w -]+/g, "").trim() || "tracker"}.csv`;
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
