import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "../actions/run";
import { staff } from "../auth/schema";
import type { StaffViewer } from "../auth/viewer";
import type { Db } from "../db/types";
import { users } from "../identity/schema";
import { Forbidden } from "../permissions";
import { shareTargetProblem, type ShareableItem } from "./access";
import { shares } from "./schema";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const shareInput = z.object({
  target: z.union([z.object({ userId: z.uuid() }), z.object({ googleGroupEmail: z.email().toLowerCase() })]),
  access: z.enum(["view", "edit"]),
});

/**
 * Shares an item with a person or a Google Group. Only the owner, or someone
 * with the kind's oversight permission, may share. The target must be able to
 * see the item's sensitivity for every student.
 */
export async function shareItem(
  db: Db, viewer: StaffViewer, item: ShareableItem, permission: string, oversight: boolean, input: z.input<typeof shareInput>,
): Promise<Result<{ id: string }>> {
  if (item.ownerStaffId !== viewer.staffId && !oversight) return { ok: false, error: "Only the owner can share this." };
  try {
    return await runStaffAction(db, viewer, { permission, input: shareInput }, async ({ tx, input: s, audit }) => {
      if ("userId" in s.target) {
        const [u] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, s.target.userId), eq(users.schoolId, viewer.schoolId)));
        if (!u) throw new Refused("That person wasn't found.");
        if (u.id === viewer.userId) throw new Refused("You already have this.");
      }
      const problem = await shareTargetProblem(tx, viewer.schoolId, item.sensitivity, s.target);
      if (problem) throw new Refused(`Can't share: ${problem}`);
      const existing = await tx.select().from(shares).where(and(eq(shares.objectKind, item.kind), eq(shares.objectId, item.id),
        "userId" in s.target ? eq(shares.userId, s.target.userId) : eq(shares.googleGroupEmail, s.target.googleGroupEmail)));
      if (existing[0]) {
        await tx.update(shares).set({ access: s.access }).where(eq(shares.id, existing[0].id));
        await audit({ action: "share.update", entity: "shares", entityId: existing[0].id, before: { access: existing[0].access }, after: { access: s.access } });
        return { ok: true as const, data: { id: existing[0].id } };
      }
      const [row] = await tx.insert(shares).values({
        schoolId: viewer.schoolId, createdBy: viewer.userId, objectKind: item.kind, objectId: item.id, access: s.access,
        ...("userId" in s.target ? { userId: s.target.userId } : { googleGroupEmail: s.target.googleGroupEmail }),
      }).returning({ id: shares.id });
      await audit({ action: "share.create", entity: "shares", entityId: row!.id, after: { kind: item.kind, objectId: item.id, ...s.target, access: s.access } });
      return { ok: true as const, data: { id: row!.id } };
    }, input);
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "You can't share this." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

export async function unshareItem(db: Db, viewer: StaffViewer, item: ShareableItem, permission: string, oversight: boolean, shareId: string): Promise<Result<null>> {
  if (item.ownerStaffId !== viewer.staffId && !oversight) return { ok: false, error: "Only the owner can change sharing." };
  try {
    return await runStaffAction(db, viewer, { permission, input: z.object({ id: z.uuid() }) }, async ({ tx, input, audit }) => {
      const [row] = await tx.delete(shares).where(and(eq(shares.id, input.id), eq(shares.objectKind, item.kind), eq(shares.objectId, item.id))).returning();
      if (!row) throw new Refused("That share wasn't found.");
      await audit({ action: "share.delete", entity: "shares", entityId: row.id, before: { kind: row.objectKind, objectId: row.objectId, userId: row.userId, googleGroupEmail: row.googleGroupEmail, access: row.access } });
      return { ok: true as const, data: null };
    }, { id: shareId });
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "You can't change sharing." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

/** Who an item is shared with, for the share dialog. */
export async function sharesOf(db: Db, item: Pick<ShareableItem, "kind" | "id">) {
  return db
    .select({ id: shares.id, userId: shares.userId, googleGroupEmail: shares.googleGroupEmail, access: shares.access, name: users.displayName })
    .from(shares)
    .leftJoin(users, eq(users.id, shares.userId))
    .where(and(eq(shares.objectKind, item.kind), eq(shares.objectId, item.id)))
    .orderBy(shares.createdAt);
}

/** Active staff someone could share with (sign-in identities), for the share dialog. */
export async function shareCandidates(db: Db, schoolId: string) {
  return db
    .select({ userId: staff.userId, name: users.displayName })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .where(and(eq(staff.schoolId, schoolId), eq(staff.status, "active")))
    .orderBy(staff.familyName, staff.givenName);
}
