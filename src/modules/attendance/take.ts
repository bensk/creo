import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { can, Forbidden } from "@/core/permissions";
import { fieldContext } from "@/core/query/run";
import { getGroup, groupMembersOn, groupsForStaff, listGroups } from "../cohorts/queries";
import { attendanceCodes, attendanceDaily } from "./schema";

// Taking daily homeroom attendance. Homeroom teachers take it for their own
// homeroom, today; ops, admins, and leaders for any homeroom and any school
// day (corrections). Each mark saves on its own, so a homeroom of 30 takes
// well under 30 seconds by keyboard.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function activeCodes(db: Db, schoolId: string) {
  return db.select({ id: attendanceCodes.id, code: attendanceCodes.code, label: attendanceCodes.label, countsAs: attendanceCodes.countsAs })
    .from(attendanceCodes).where(and(eq(attendanceCodes.schoolId, schoolId), isNull(attendanceCodes.archivedAt))).orderBy(asc(attendanceCodes.position));
}

/** Homerooms the viewer takes attendance for: their own, or every homeroom for ops, admins, and leaders. */
export async function homeroomsFor(db: Db, viewer: StaffViewer) {
  const all = (await listGroups(db, viewer.schoolId)).filter((g) => g.type === "homeroom" && !g.archivedAt);
  if (await can(db, viewer, "attendance.manage")) return { homerooms: all, manage: true };
  const mine = new Set((await groupsForStaff(db, viewer.staffId)).filter((g) => g.type === "homeroom" && g.function === "homeroom_teacher").map((g) => g.id));
  return { homerooms: all.filter((g) => mine.has(g.id)), manage: false };
}

/** A homeroom's students on a date and what's been marked for each. */
export async function homeroomDay(db: Db, schoolId: string, groupId: string, date: string) {
  const studentIds = await groupMembersOn(db, groupId, date);
  const marks = studentIds.length
    ? await db.select({ studentId: attendanceDaily.studentId, codeId: attendanceDaily.codeId, note: attendanceDaily.note })
      .from(attendanceDaily).where(and(eq(attendanceDaily.schoolId, schoolId), eq(attendanceDaily.date, date), inArray(attendanceDaily.studentId, studentIds)))
    : [];
  return { studentIds, marks: new Map(marks.map((m) => [m.studentId, m])) };
}

/** Every mark was already what was asked: nothing to write. */
class NoChange extends Error {}

const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());

const markInput = z.object({
  groupId: z.uuid(),
  date: z.iso.date(),
  marks: z.array(z.object({ studentId: z.uuid(), codeId: z.uuid() })).min(1).max(60),
});

/**
 * Records attendance for one or more students in a homeroom on a date. A
 * teacher marks only today and only their homeroom; everyone marked must be
 * in that homeroom on that day. Changing a mark keeps the old one in the audit log.
 */
export async function markAttendance(db: Db, viewer: StaffViewer, input: z.input<typeof markInput>): Promise<Result<{ saved: number }>> {
  try {
    // Homeroom-scoped for teachers: checked against the first student, and every
    // student must be in the homeroom the teacher teaches (checked below).
    const target = (i: z.infer<typeof markInput>) => ({ studentId: i.marks[0]!.studentId });
    return await runStaffAction(db, viewer, { permission: "attendance.take", input: markInput, target }, async ({ tx, input: m, audit }) => {
      const { today } = await fieldContext(tx, viewer.schoolId);
      const manage = await can(tx, viewer, "attendance.manage");
      if (m.date > today) throw new Refused("Attendance can't be taken for a day that hasn't happened.");
      if (!manage && m.date !== today) throw new Refused("Teachers take attendance for today. Ask ops to correct an earlier day.");
      if (isWeekend(m.date)) throw new Refused("That's a weekend.");
      const group = await getGroup(tx, viewer.schoolId, m.groupId);
      if (!group || group.type !== "homeroom") throw new Refused("That homeroom wasn't found.");
      if (!manage) {
        const mine = (await groupsForStaff(tx, viewer.staffId)).some((g) => g.id === group.id && g.function === "homeroom_teacher");
        if (!mine) throw new Forbidden("attendance.take");
      }
      const members = new Set(await groupMembersOn(tx, group.id, m.date));
      const outside = m.marks.filter((x) => !members.has(x.studentId));
      if (outside.length) throw new Refused("Some of those students weren't in this homeroom that day.");
      const codes = new Map((await activeCodes(tx, viewer.schoolId)).map((c) => [c.id, c]));
      if (m.marks.some((x) => !codes.has(x.codeId))) throw new Refused("That attendance code isn't in use.");

      const existing = new Map((await tx.select().from(attendanceDaily)
        .where(and(eq(attendanceDaily.date, m.date), inArray(attendanceDaily.studentId, m.marks.map((x) => x.studentId))))).map((r) => [r.studentId, r]));
      let saved = 0;
      for (const x of m.marks) {
        const before = existing.get(x.studentId);
        if (before?.codeId === x.codeId) continue;
        if (before) {
          await tx.update(attendanceDaily).set({ codeId: x.codeId, source: "sis" }).where(eq(attendanceDaily.id, before.id));
          await audit({ action: "attendance.change", entity: "attendance_daily", entityId: before.id,
            before: { code: codes.get(before.codeId)?.code ?? before.codeId }, after: { code: codes.get(x.codeId)!.code, studentId: x.studentId, date: m.date } });
        } else {
          const [row] = await tx.insert(attendanceDaily).values({ schoolId: viewer.schoolId, createdBy: viewer.userId, studentId: x.studentId, date: m.date, codeId: x.codeId, source: "sis" })
            .returning({ id: attendanceDaily.id });
          await audit({ action: "attendance.mark", entity: "attendance_daily", entityId: row!.id, after: { code: codes.get(x.codeId)!.code, studentId: x.studentId, date: m.date } });
        }
        saved++;
      }
      if (saved === 0) throw new NoChange();
      return { ok: true as const, data: { saved } };
    }, input);
  } catch (error) {
    if (error instanceof NoChange) return { ok: true, data: { saved: 0 } };
    if (error instanceof Forbidden) return { ok: false, error: "You take attendance for your own homeroom only." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

/** For each homeroom, how many of its students have a mark on a date (the missing-attendance view). */
export async function attendanceProgress(db: Db, schoolId: string, date: string) {
  const homerooms = (await listGroups(db, schoolId)).filter((g) => g.type === "homeroom" && !g.archivedAt);
  return Promise.all(homerooms.map(async (h) => {
    const day = await homeroomDay(db, schoolId, h.id, date);
    return { id: h.id, name: h.name, gradeLevel: h.gradeLevel, staffNames: h.staffNames, students: day.studentIds.length, marked: day.marks.size };
  }));
}
