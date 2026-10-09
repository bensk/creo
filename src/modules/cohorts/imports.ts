import { and, eq, isNull, lte, or, gte } from "drizzle-orm";
import { dayBefore, type ImportContext } from "@/core/imports/context";
import { groupMemberships, groups } from "./schema";

// Public write functions for importers. Memberships are effective-dated: a
// change ends the old membership yesterday and starts the new one today, so
// "who was in Albany on Oct 3" stays answerable.

/** The homeroom (or grade team) group for this year, created if it doesn't exist yet. */
export async function ensureGroup(
  ctx: ImportContext,
  schoolYearId: string,
  group: { type: "homeroom" | "grade_team"; name: string; gradeLevel: number },
): Promise<string> {
  const [existing] = await ctx.db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.schoolYearId, schoolYearId), eq(groups.type, group.type), eq(groups.name, group.name)));
  if (existing) return existing.id;
  const [row] = await ctx.db
    .insert(groups)
    .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, schoolYearId, ...group })
    .returning({ id: groups.id });
  await ctx.audit("group.create", "groups", row!.id, null, group);
  return row!.id;
}

/**
 * Makes `groupId` the student's one current group of this type for the year.
 * Pass null to end their current membership (e.g. withdrawn).
 */
export async function setCurrentGroup(
  ctx: ImportContext,
  studentId: string,
  schoolYearId: string,
  type: "homeroom" | "grade_team",
  groupId: string | null,
  startsOn: string,
): Promise<"created" | "moved" | "ended" | "unchanged"> {
  const current = await ctx.db
    .select({ id: groupMemberships.id, groupId: groupMemberships.groupId, startsOn: groupMemberships.startsOn })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(
      and(
        eq(groupMemberships.studentId, studentId), eq(groups.schoolYearId, schoolYearId), eq(groups.type, type),
        lte(groupMemberships.startsOn, ctx.today), or(isNull(groupMemberships.endsOn), gte(groupMemberships.endsOn, ctx.today)),
      ),
    );
  if (groupId && current.length === 1 && current[0]!.groupId === groupId) return "unchanged";

  let ended = false;
  for (const m of current) {
    // A membership that started today is replaced outright; the audit log keeps it.
    if (m.startsOn >= ctx.today) await ctx.db.delete(groupMemberships).where(eq(groupMemberships.id, m.id));
    else await ctx.db.update(groupMemberships).set({ endsOn: dayBefore(ctx.today) }).where(eq(groupMemberships.id, m.id));
    await ctx.audit("group_membership.end", "group_memberships", m.id, { groupId: m.groupId }, { endsOn: dayBefore(ctx.today) });
    ended = true;
  }
  if (!groupId) return ended ? "ended" : "unchanged";
  const start = ended ? ctx.today : startsOn > ctx.today ? ctx.today : startsOn;
  const [row] = await ctx.db
    .insert(groupMemberships)
    .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, groupId, studentId, startsOn: start })
    .returning({ id: groupMemberships.id });
  await ctx.audit("group_membership.create", "group_memberships", row!.id, null, { groupId, startsOn: start });
  return ended ? "moved" : "created";
}
