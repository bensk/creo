import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { Forbidden } from "@/core/permissions";
import { fieldContext } from "@/core/query/run";
import { currentlyEnrolled } from "../students/queries";
import { dayInfo } from "./calendar";
import { attendanceCodes, attendanceDaily } from "./schema";

// The late-arrivals desk (ops): a student signing in late is marked tardy for
// today with the time they arrived, whatever homeroom marked (Ben, Oct 15 2026).

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function signInLate(db: Db, viewer: StaffViewer, studentId: string): Promise<Result<{ arrivedAt: string }>> {
  try {
    return await runStaffAction(db, viewer, { permission: "attendance.manage", input: z.object({ studentId: z.uuid() }) }, async ({ tx, input, audit }) => {
      const { today } = await fieldContext(tx, viewer.schoolId);
      const day = await dayInfo(tx, viewer.schoolId, today);
      if (!day.isSchoolDay) throw new Refused("Today isn't a school day.");
      if (!(await currentlyEnrolled(tx, viewer.schoolId, [input.studentId])).has(input.studentId)) throw new Refused("That student isn't enrolled.");
      const [tardy] = await tx.select().from(attendanceCodes)
        .where(and(eq(attendanceCodes.schoolId, viewer.schoolId), eq(attendanceCodes.countsAs, "tardy"))).orderBy(asc(attendanceCodes.position)).limit(1);
      if (!tardy) throw new Refused("There's no tardy code set up.");
      const arrivedAt = new Date();
      const [before] = await tx.select().from(attendanceDaily).where(and(eq(attendanceDaily.studentId, input.studentId), eq(attendanceDaily.date, today)));
      if (before?.arrivedAt) throw new Refused("They already signed in today.");
      let id: string;
      if (before) {
        await tx.update(attendanceDaily).set({ codeId: tardy.id, arrivedAt, source: "sis" }).where(eq(attendanceDaily.id, before.id));
        id = before.id;
      } else {
        const [row] = await tx.insert(attendanceDaily).values({
          schoolId: viewer.schoolId, createdBy: viewer.userId, studentId: input.studentId, date: today, codeId: tardy.id, arrivedAt, source: "sis",
        }).returning({ id: attendanceDaily.id });
        id = row!.id;
      }
      const [prev] = before ? await tx.select({ code: attendanceCodes.code }).from(attendanceCodes).where(eq(attendanceCodes.id, before.codeId)) : [];
      await audit({ action: "attendance.late_sign_in", entity: "attendance_daily", entityId: id,
        before: before ? { code: prev?.code } : null, after: { code: tardy.code, studentId: input.studentId, date: today, arrivedAt: arrivedAt.toISOString() } });
      return { ok: true as const, data: { arrivedAt: arrivedAt.toISOString() } };
    }, { studentId });
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "The late desk is for ops, admins, and leaders." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

/** Today's late sign-ins, latest first. */
export async function lateArrivals(db: Db, schoolId: string, date: string) {
  return db.select({ studentId: attendanceDaily.studentId, arrivedAt: attendanceDaily.arrivedAt }).from(attendanceDaily)
    .where(and(eq(attendanceDaily.schoolId, schoolId), eq(attendanceDaily.date, date), isNotNull(attendanceDaily.arrivedAt)))
    .orderBy(desc(attendanceDaily.arrivedAt));
}
