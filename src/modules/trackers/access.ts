import { and, desc, eq } from "drizzle-orm";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { can } from "@/core/permissions";
import type { Sensitivity } from "@/core/permissions/sensitivity";
import { accessibleSql, accessTo, type Access, type ShareableItem } from "@/core/sharing/access";
import type { TrackerRow } from "./model";
import { trackers } from "./schema";

export const asShareable = (t: TrackerRow): ShareableItem => ({ kind: "tracker", id: t.id, ownerStaffId: t.ownerStaffId, sensitivity: t.sensitivity as Sensitivity });
export const trackerOversight = (db: Db, viewer: StaffViewer) => can(db, viewer, "trackers.view_all");

/** A tracker and the viewer's access to it, or null if they can't open it. */
export async function getTracker(db: Db, viewer: StaffViewer, trackerId: string): Promise<{ tracker: TrackerRow; access: Access } | null> {
  const [tracker] = await db.select().from(trackers).where(and(eq(trackers.id, trackerId), eq(trackers.schoolId, viewer.schoolId)));
  if (!tracker) return null;
  const access = await accessTo(db, viewer, asShareable(tracker), await trackerOversight(db, viewer));
  return access ? { tracker, access } : null;
}

export async function trackersForViewer(db: Db, viewer: StaffViewer) {
  const visible = await accessibleSql(db, viewer, "tracker", { id: trackers.id, owner: trackers.ownerStaffId, sensitivity: trackers.sensitivity }, await trackerOversight(db, viewer));
  return db.select().from(trackers).where(and(eq(trackers.schoolId, viewer.schoolId), visible)).orderBy(trackers.archivedAt, desc(trackers.updatedAt));
}

export const canEdit = (access: Access) => access === "owner" || access === "edit";
