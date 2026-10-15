import { and, eq, gte, isNull, lte, or, type AnyColumn } from "drizzle-orm";
import { dayBefore, diff, type ImportContext } from "@/core/imports/context";
import { courses, groupMemberships, groups, groupStaff, sectionEnrollments, sections, sectionStaff } from "./schema";

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

/** Current rows of an effective-dated table on ctx.today. */
const currentOnToday = (ctx: ImportContext, startsOn: AnyColumn, endsOn: AnyColumn) =>
  and(lte(startsOn, ctx.today), or(isNull(endsOn), gte(endsOn, ctx.today)));

/**
 * Ends effective-dated rows as of yesterday. A row that started today is
 * removed instead (it never applied to a finished day); the audit log keeps it.
 */
async function endRows(
  ctx: ImportContext,
  table: typeof sectionStaff | typeof sectionEnrollments | typeof groupStaff,
  entity: string,
  rows: { id: string; startsOn: string }[],
) {
  for (const r of rows) {
    if (r.startsOn >= ctx.today) await ctx.db.delete(table).where(eq(table.id, r.id));
    else await ctx.db.update(table).set({ endsOn: dayBefore(ctx.today) }).where(eq(table.id, r.id));
    await ctx.audit(`${entity}.end`, entity, r.id, null, { endsOn: dayBefore(ctx.today) });
  }
}

export interface ImportedCourse {
  name: string;
  number: string | null;
  description: string | null;
  subject: string | null;
}

/** The course for this year, matched by number (or by name when there's no number), created or updated. */
export async function upsertCourse(ctx: ImportContext, schoolYearId: string, course: ImportedCourse): Promise<string> {
  const [existing] = await ctx.db
    .select()
    .from(courses)
    .where(and(
      eq(courses.schoolYearId, schoolYearId),
      course.number ? eq(courses.number, course.number) : and(isNull(courses.number), eq(courses.name, course.name)),
    ));
  if (!existing) {
    const [row] = await ctx.db.insert(courses).values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, schoolYearId, ...course }).returning({ id: courses.id });
    await ctx.audit("course.create", "courses", row!.id, null, course);
    return row!.id;
  }
  const d = diff(existing as Record<string, unknown>, { ...course });
  if (d.changed) {
    await ctx.db.update(courses).set(course).where(eq(courses.id, existing.id));
    await ctx.audit("course.update", "courses", existing.id, d.before, d.after);
  }
  return existing.id;
}

export type ImportedSection = Omit<typeof sections.$inferInsert, "id" | "schoolId" | "createdBy" | "createdAt" | "updatedAt" | "archivedAt">;

export async function upsertSection(ctx: ImportContext, existingId: string | null, section: ImportedSection) {
  if (!existingId) {
    const [row] = await ctx.db.insert(sections).values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, ...section }).returning({ id: sections.id });
    await ctx.audit("section.create", "sections", row!.id, null, { name: section.name });
    return { id: row!.id, change: "created" as const };
  }
  const [current] = await ctx.db.select().from(sections).where(eq(sections.id, existingId));
  const next = { ...section, archivedAt: null };
  const d = diff(current as Record<string, unknown>, next);
  if (!d.changed) return { id: existingId, change: "unchanged" as const };
  await ctx.db.update(sections).set(next).where(eq(sections.id, existingId));
  await ctx.audit("section.update", "sections", existingId, d.before, d.after);
  return { id: existingId, change: "updated" as const };
}

/** A section no longer in the source: archived, with its teachers and students ended. */
export async function archiveSection(ctx: ImportContext, sectionId: string): Promise<boolean> {
  const [current] = await ctx.db.select({ archivedAt: sections.archivedAt }).from(sections).where(eq(sections.id, sectionId));
  if (!current || current.archivedAt) return false;
  await syncSectionStaff(ctx, sectionId, []);
  await syncSectionEnrollments(ctx, sectionId, []);
  await ctx.db.update(sections).set({ archivedAt: new Date() }).where(eq(sections.id, sectionId));
  await ctx.audit("section.archive", "sections", sectionId, null, { archived: true });
  return true;
}

/** Makes the section's current teachers exactly `wanted`. Returns how many rows changed. */
export async function syncSectionStaff(ctx: ImportContext, sectionId: string, wanted: { staffId: string; role: "primary" | "co_teacher" }[]) {
  const current = await ctx.db
    .select({ id: sectionStaff.id, staffId: sectionStaff.staffId, role: sectionStaff.role, startsOn: sectionStaff.startsOn })
    .from(sectionStaff)
    .where(and(eq(sectionStaff.sectionId, sectionId), currentOnToday(ctx, sectionStaff.startsOn, sectionStaff.endsOn)));
  const key = (x: { staffId: string; role: string }) => `${x.staffId}:${x.role}`;
  const want = new Set(wanted.map(key));
  const have = new Set(current.map(key));
  const stale = current.filter((r) => !want.has(key(r)));
  await endRows(ctx, sectionStaff, "section_staff", stale);
  let changes = stale.length;
  for (const w of wanted) {
    if (have.has(key(w))) continue;
    const [row] = await ctx.db
      .insert(sectionStaff)
      .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, sectionId, staffId: w.staffId, role: w.role, startsOn: ctx.today })
      .returning({ id: sectionStaff.id });
    await ctx.audit("section_staff.create", "section_staff", row!.id, null, { sectionId, staffId: w.staffId, role: w.role });
    changes++;
  }
  return changes;
}

/** Makes the section's current students exactly `studentIds`. */
export async function syncSectionEnrollments(ctx: ImportContext, sectionId: string, studentIds: readonly string[]) {
  const current = await ctx.db
    .select({ id: sectionEnrollments.id, studentId: sectionEnrollments.studentId, startsOn: sectionEnrollments.startsOn })
    .from(sectionEnrollments)
    .where(and(eq(sectionEnrollments.sectionId, sectionId), currentOnToday(ctx, sectionEnrollments.startsOn, sectionEnrollments.endsOn)));
  const want = new Set(studentIds);
  const have = new Set(current.map((r) => r.studentId));
  const stale = current.filter((r) => !want.has(r.studentId));
  await endRows(ctx, sectionEnrollments, "section_enrollments", stale);
  const added = [...want].filter((id) => !have.has(id));
  if (added.length) {
    const rows = await ctx.db
      .insert(sectionEnrollments)
      .values(added.map((studentId) => ({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, sectionId, studentId, startsOn: ctx.today })))
      .returning({ id: sectionEnrollments.id, studentId: sectionEnrollments.studentId });
    for (const r of rows) await ctx.audit("section_enrollment.create", "section_enrollments", r.id, null, { sectionId, studentId: r.studentId });
  }
  return { added: added.length, ended: stale.length };
}

/** Makes the group's current staff with this function exactly `staffIds` (e.g. homeroom teachers). */
export async function syncGroupStaff(ctx: ImportContext, groupId: string, fn: "homeroom_teacher" | "lead" | "member", staffIds: readonly string[]) {
  const current = await ctx.db
    .select({ id: groupStaff.id, staffId: groupStaff.staffId, startsOn: groupStaff.startsOn })
    .from(groupStaff)
    .where(and(eq(groupStaff.groupId, groupId), eq(groupStaff.function, fn), currentOnToday(ctx, groupStaff.startsOn, groupStaff.endsOn)));
  const want = new Set(staffIds);
  const have = new Set(current.map((r) => r.staffId));
  const stale = current.filter((r) => !want.has(r.staffId));
  await endRows(ctx, groupStaff, "group_staff", stale);
  let changes = stale.length;
  for (const staffId of want) {
    if (have.has(staffId)) continue;
    const [row] = await ctx.db
      .insert(groupStaff)
      .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, groupId, staffId, function: fn, startsOn: ctx.today })
      .returning({ id: groupStaff.id });
    await ctx.audit("group_staff.create", "group_staff", row!.id, null, { groupId, staffId, function: fn });
    changes++;
  }
  return changes;
}

/** This year's homeroom names, for recognizing homeroom sections. */
export async function homeroomNames(ctx: ImportContext, schoolYearId: string): Promise<string[]> {
  const rows = await ctx.db.select({ name: groups.name }).from(groups).where(and(eq(groups.schoolYearId, schoolYearId), eq(groups.type, "homeroom")));
  return rows.map((r) => r.name);
}
