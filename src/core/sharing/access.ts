import { and, eq, inArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { staff } from "../auth/schema";
import { loadViewer, type StaffViewer } from "../auth/viewer";
import type { StaffRole } from "../db/columns";
import type { Db } from "../db/types";
import { ROLE_SENSITIVITY } from "../permissions/matrix";
import type { Sensitivity } from "../permissions/sensitivity";
import { groupsOfStaff, staffInGroup } from "./groups";
import { shares, type SHAREABLE_KINDS } from "./schema";

// Who can open a shareable item (a list, a tracker): its owner, the people
// and Google Groups it's shared with, and, for viewing, roles with an
// oversight permission. A share only reaches people whose role sees the
// item's sensitivity for every student; anyone else is refused, even if a
// share names them. That rule is checked when sharing and again on every open.

export type ShareKind = (typeof SHAREABLE_KINDS)[number];
export type Access = "owner" | "edit" | "view";

/** Sensitivity levels a set of roles sees for every student (not only assigned ones). */
export function levelsEverywhere(roles: readonly StaffRole[]): Set<Sensitivity> {
  const levels = new Set<Sensitivity>();
  for (const r of roles) ROLE_SENSITIVITY[r].all.forEach((l) => levels.add(l));
  return levels;
}

export function mayReceive(roles: readonly StaffRole[], sensitivity: Sensitivity): boolean {
  return levelsEverywhere(roles).has(sensitivity);
}

export interface ShareableItem {
  kind: ShareKind;
  id: string;
  ownerStaffId: string;
  sensitivity: Sensitivity;
}

/** The viewer's access to an item, or null. `oversight` is whether they hold the kind's view-all permission. */
export async function accessTo(db: Db, viewer: StaffViewer, item: ShareableItem, oversight: boolean): Promise<Access | null> {
  if (item.ownerStaffId === viewer.staffId) return "owner";
  if (!mayReceive(viewer.roles, item.sensitivity)) return null;
  const groups = await groupsOfStaff(db, viewer.staffId);
  const rows = await db.select({ access: shares.access }).from(shares).where(and(
    eq(shares.objectKind, item.kind), eq(shares.objectId, item.id),
    or(eq(shares.userId, viewer.userId), groups.length ? inArray(shares.googleGroupEmail, groups) : sql`false`),
  ));
  if (rows.some((r) => r.access === "edit")) return "edit";
  if (rows.length) return "view";
  return oversight ? "view" : null;
}

/**
 * SQL condition for "the viewer can open this item", for index pages. Pass the
 * item table's id, owner, and sensitivity columns.
 */
export async function accessibleSql(db: Db, viewer: StaffViewer, kind: ShareKind, cols: { id: AnyColumn; owner: AnyColumn; sensitivity: AnyColumn }, oversight: boolean): Promise<SQL> {
  if (oversight) return sql`true`;
  const groups = await groupsOfStaff(db, viewer.staffId);
  const levels = [...levelsEverywhere(viewer.roles)];
  const sharedWithViewer = sql`exists (select 1 from shares sh where sh.object_kind = ${kind} and sh.object_id = ${cols.id}
    and (sh.user_id = ${viewer.userId}${groups.length ? sql` or sh.google_group_email in (${sql.join(groups.map((g) => sql`${g}`), sql`, `)})` : sql``}))`;
  return sql`(${cols.owner} = ${viewer.staffId} or (${sharedWithViewer} and ${cols.sensitivity} in (${sql.join(levels.map((l) => sql`${l}`), sql`, `)})))`;
}

/**
 * Whether a share target may receive an item of this sensitivity. For a group,
 * every member must qualify; the reason names how many don't, never who.
 */
export async function shareTargetProblem(
  db: Db,
  schoolId: string,
  sensitivity: Sensitivity,
  target: { userId: string } | { googleGroupEmail: string },
): Promise<string | null> {
  const label = sensitivity === "standard" ? "" : ` It shows ${sensitivity} information.`;
  if ("userId" in target) {
    const viewer = await loadViewer(db, target.userId, "staff");
    if (!viewer || viewer.kind !== "staff" || !viewer.hasAccess) return "That person isn't active staff.";
    return mayReceive(viewer.roles, sensitivity) ? null : `Their role can't see this for every student.${label}`;
  }
  const members = await staffInGroup(db, schoolId, target.googleGroupEmail);
  if (members.length === 0) return "That group has no SIS staff members yet. Groups are read in the nightly Directory sync.";
  const userIds = await db.select({ userId: staff.userId }).from(staff).where(inArray(staff.id, members));
  let blocked = 0;
  for (const { userId } of userIds) {
    const v = await loadViewer(db, userId, "staff");
    if (!v || v.kind !== "staff" || !mayReceive(v.roles, sensitivity)) blocked++;
  }
  return blocked ? `${blocked} ${blocked === 1 ? "member's role" : "members' roles"} can't see this for every student.${label}` : null;
}
