import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "../audit/record";
import { STAFF_ROLES, type StaffRole } from "../db/columns";
import type { Db } from "../db/types";
import { users } from "../identity/schema";
import { AI_FEATURES, type AiFeature } from "./features";
import { aiGrants } from "./schema";

// The logic behind `pnpm ai:grant`, `ai:revoke`, and `ai:list`. Only the CLI
// writes ai_grants; there is no UI for it.

export type AiTarget = { role: StaffRole } | { email: string };

export interface Operator {
  userId: string;
  schoolId: string;
}

export class AiAdminError extends Error {}

/** The person running the CLI, by email. Must be an active staff user. */
export async function operatorByEmail(db: Db, email: string): Promise<Operator> {
  const [user] = await db
    .select({ id: users.id, schoolId: users.schoolId, kind: users.kind, status: users.status })
    .from(users)
    .where(eq(users.email, email));
  if (!user || user.kind !== "staff" || user.status !== "active") {
    throw new AiAdminError(`${email} is not an active staff user, so it can't run AI grants`);
  }
  return { userId: user.id, schoolId: user.schoolId };
}

export function parseFeatures(values: readonly string[]): AiFeature[] | null {
  if (values.length === 0) return null;
  for (const v of values) {
    if (!(AI_FEATURES as readonly string[]).includes(v)) {
      throw new AiAdminError(`Unknown AI feature "${v}". Known: ${AI_FEATURES.join(", ")}`);
    }
  }
  return [...new Set(values)].sort() as AiFeature[];
}

export function parseRole(value: string): StaffRole {
  if (!(STAFF_ROLES as readonly string[]).includes(value)) {
    throw new AiAdminError(`"${value}" is not a staff role. AI can only be granted to: ${STAFF_ROLES.join(", ")}`);
  }
  return value as StaffRole;
}

async function resolveTarget(db: Db, operator: Operator, target: AiTarget) {
  if ("role" in target) return { role: target.role, userId: null, label: `role ${target.role}` };
  const [user] = await db
    .select({ id: users.id, kind: users.kind })
    .from(users)
    .where(and(eq(users.email, target.email), eq(users.schoolId, operator.schoolId)));
  if (!user) throw new AiAdminError(`No user with email ${target.email}`);
  if (user.kind !== "staff") throw new AiAdminError("AI can't be granted to students or families");
  return { role: null, userId: user.id, label: target.email };
}

const sameFeatures = (a: string[] | null, b: string[] | null) =>
  (a === null && b === null) || (a !== null && b !== null && a.join() === [...b].sort().join());

export async function grantAi(db: Db, operator: Operator, target: AiTarget, features: AiFeature[] | null, note?: string) {
  const t = await resolveTarget(db, operator, target);
  // A personal revoke for the same features is lifted by a new grant.
  if (t.userId) {
    const revokes = await db
      .select({ id: aiGrants.id, features: aiGrants.features })
      .from(aiGrants)
      .where(and(eq(aiGrants.userId, t.userId), eq(aiGrants.effect, "revoke"), isNull(aiGrants.endedAt)));
    for (const r of revokes.filter((r) => sameFeatures(r.features, features))) {
      await db.update(aiGrants).set({ endedAt: new Date(), endedBy: operator.userId }).where(eq(aiGrants.id, r.id));
    }
  }
  const [row] = await db
    .insert(aiGrants)
    .values({ schoolId: operator.schoolId, createdBy: operator.userId, role: t.role, userId: t.userId, effect: "grant", features, note: note ?? null })
    .returning({ id: aiGrants.id });
  await recordAudit(db, {
    schoolId: operator.schoolId, actorUserId: operator.userId, action: "ai.grant", entity: "ai_grants",
    entityId: row!.id, after: { target: t.label, features, note: note ?? null }, via: "cli",
  });
  return `Granted AI (${features?.join(", ") ?? "all features"}) to ${t.label}`;
}

/**
 * Ends matching grants. For a user, also records a personal revoke so a role
 * grant no longer applies to them for those features.
 */
export async function revokeAi(db: Db, operator: Operator, target: AiTarget, features: AiFeature[] | null, note?: string) {
  const t = await resolveTarget(db, operator, target);
  const active = await db
    .select({ id: aiGrants.id, features: aiGrants.features })
    .from(aiGrants)
    .where(
      and(
        eq(aiGrants.schoolId, operator.schoolId),
        eq(aiGrants.effect, "grant"),
        isNull(aiGrants.endedAt),
        t.userId ? eq(aiGrants.userId, t.userId) : eq(aiGrants.role, t.role!),
      ),
    );
  const ending = active.filter((r) => features === null || sameFeatures(r.features, features));
  for (const r of ending) {
    await db.update(aiGrants).set({ endedAt: new Date(), endedBy: operator.userId }).where(eq(aiGrants.id, r.id));
  }
  let revokeRow: string | null = null;
  if (t.userId) {
    const [row] = await db
      .insert(aiGrants)
      .values({ schoolId: operator.schoolId, createdBy: operator.userId, userId: t.userId, effect: "revoke", features, note: note ?? null })
      .returning({ id: aiGrants.id });
    revokeRow = row!.id;
  }
  await recordAudit(db, {
    schoolId: operator.schoolId, actorUserId: operator.userId, action: "ai.revoke", entity: "ai_grants",
    entityId: revokeRow, after: { target: t.label, features, ended: ending.length, note: note ?? null }, via: "cli",
  });
  return `Revoked AI (${features?.join(", ") ?? "all features"}) for ${t.label}; ended ${ending.length} grant(s)`;
}

export async function listAi(db: Db, operator: Operator) {
  const grantedBy = sql<string>`(select email from ${users} where ${users.id} = ${aiGrants.createdBy})`;
  const target = sql<string>`coalesce(${aiGrants.role}, (select email from ${users} where ${users.id} = ${aiGrants.userId}))`;
  return db
    .select({
      target, effect: aiGrants.effect, features: aiGrants.features, grantedBy,
      grantedAt: aiGrants.createdAt, note: aiGrants.note,
    })
    .from(aiGrants)
    .where(and(eq(aiGrants.schoolId, operator.schoolId), isNull(aiGrants.endedAt)))
    .orderBy(aiGrants.createdAt);
}
