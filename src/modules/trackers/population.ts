import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { recordAudit } from "@/core/audit/record";
import { staff } from "@/core/auth/schema";
import { loadViewer, type StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import type { Sensitivity } from "@/core/permissions/sensitivity";
import { fieldContext, QueryError, runQuery, specSensitivity } from "@/core/query/run";
import { getList, listStudentIds } from "../cohorts/lists";
import { getGroup, groupMembers } from "../cohorts/queries";
import { enrolledStudentIds } from "../students/queries";
import { MAX_ROWS, populationOf, type Population, type TrackerRow } from "./model";
import { trackerRows } from "./schema";

// Who a tracker is about. Populations are worked out as the tracker's owner,
// so a live tracker has the same students for everyone who opens it; who can
// open it at all is decided by sharing and sensitivity.

export type Resolved = { ok: true; studentIds: string[]; sensitivity: Sensitivity } | { ok: false; error: string };

export async function resolvePopulation(db: Db, asViewer: StaffViewer, population: Population): Promise<Resolved> {
  try {
    switch (population.source) {
      case "all":
        return { ok: true, studentIds: await enrolledStudentIds(db, asViewer.schoolId), sensitivity: "standard" };
      case "grade":
        return { ok: true, studentIds: await enrolledStudentIds(db, asViewer.schoolId, population.grade), sensitivity: "standard" };
      case "group": {
        const group = await getGroup(db, asViewer.schoolId, population.ref);
        if (!group) return { ok: false, error: "The group this tracker follows no longer exists." };
        return { ok: true, studentIds: (await groupMembers(db, group.id)).map((m) => m.studentId), sensitivity: "standard" };
      }
      case "list": {
        const found = await getList(db, asViewer, population.ref);
        if (!found) return { ok: false, error: "The list this tracker follows isn't available to its owner anymore." };
        return { ok: true, studentIds: await listStudentIds(db, asViewer, found.list), sensitivity: found.list.sensitivity as Sensitivity };
      }
      case "spec": {
        const spec = { ...population.spec, source: "students", columns: ["name"], limit: MAX_ROWS };
        const result = await runQuery(db, asViewer, spec);
        return { ok: true, studentIds: result.rows.map((r) => r.id), sensitivity: await specSensitivity(db, asViewer.schoolId, spec) };
      }
    }
  } catch (error) {
    if (error instanceof QueryError) return { ok: false, error: error.message };
    throw error;
  }
}

/** The owner as a viewer (populations resolve as them), or the given fallback if they've left. */
export async function ownerViewer(db: Db, tracker: TrackerRow, fallback: StaffViewer): Promise<StaffViewer> {
  const [owner] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.id, tracker.ownerStaffId));
  const v = owner ? await loadViewer(db, owner.userId, "staff") : null;
  return v && v.kind === "staff" && v.hasAccess ? v : fallback;
}

/**
 * Brings a live tracker's rows in line with its population: new students get
 * a row, students who left are archived (their values kept), returning
 * students get their row back. Snapshot trackers are left alone.
 */
export async function syncLiveRows(db: Db, tracker: TrackerRow, asViewer: StaffViewer, actorUserId: string): Promise<{ added: number; archived: number } | { error: string }> {
  if (tracker.populationKind !== "live" || tracker.archivedAt) return { added: 0, archived: 0 };
  const resolved = await resolvePopulation(db, asViewer, populationOf(tracker));
  if (!resolved.ok) return { error: resolved.error };
  const { today } = await fieldContext(db, tracker.schoolId);
  const want = new Set(resolved.studentIds);
  const rows = await db.select({ id: trackerRows.id, studentId: trackerRows.studentId, archivedOn: trackerRows.archivedOn })
    .from(trackerRows).where(eq(trackerRows.trackerId, tracker.id));
  const have = new Map(rows.map((r) => [r.studentId, r]));
  const toArchive = rows.filter((r) => !r.archivedOn && !want.has(r.studentId)).map((r) => r.id);
  const toRestore = rows.filter((r) => r.archivedOn && want.has(r.studentId)).map((r) => r.id);
  const toAdd = [...want].filter((id) => !have.has(id));
  if (toArchive.length) await db.update(trackerRows).set({ archivedOn: today }).where(and(inArray(trackerRows.id, toArchive), isNull(trackerRows.archivedOn)));
  if (toRestore.length) await db.update(trackerRows).set({ archivedOn: null }).where(and(inArray(trackerRows.id, toRestore), isNotNull(trackerRows.archivedOn)));
  if (toAdd.length) {
    await db.insert(trackerRows).values(toAdd.map((studentId) => ({ schoolId: tracker.schoolId, createdBy: actorUserId, trackerId: tracker.id, studentId, addedOn: today })))
      .onConflictDoNothing();
  }
  if (toAdd.length || toRestore.length || toArchive.length) {
    await recordAudit(db, {
      schoolId: tracker.schoolId, actorUserId, action: "tracker.population_sync", entity: "trackers", entityId: tracker.id,
      after: { added: toAdd.length, restored: toRestore.length, archived: toArchive.length }, via: "system",
    });
  }
  return { added: toAdd.length + toRestore.length, archived: toArchive.length };
}
