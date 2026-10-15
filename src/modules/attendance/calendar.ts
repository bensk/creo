import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { Forbidden } from "@/core/permissions";
import { schoolYears } from "@/core/school/schema";
import { SCHOOL_DAY_KINDS, schoolDays } from "./schema";

// The school calendar: weekdays in the school year are full school days and
// weekends are off, unless ops have marked a day otherwise on the calendar page.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DayInfo {
  isSchoolDay: boolean;
  kind: "full" | "half" | "other" | "weekend" | "outside";
  note: string | null;
}

const weekend = (date: string) => [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());

export async function yearOf(db: Db, schoolId: string, date: string) {
  const [year] = await db.select().from(schoolYears)
    .where(and(eq(schoolYears.schoolId, schoolId), lte(schoolYears.startsOn, date), gte(schoolYears.endsOn, date)));
  return year ?? null;
}

export async function dayInfo(db: Db, schoolId: string, date: string): Promise<DayInfo> {
  const [row] = await db.select().from(schoolDays).where(and(eq(schoolDays.schoolId, schoolId), eq(schoolDays.date, date)));
  if (row) return { isSchoolDay: row.isInstructional, kind: row.dayType as DayInfo["kind"], note: row.note };
  if (!(await yearOf(db, schoolId, date))) return { isSchoolDay: false, kind: "outside", note: null };
  return weekend(date) ? { isSchoolDay: false, kind: "weekend", note: null } : { isSchoolDay: true, kind: "full", note: null };
}

/** The year's marked days (days off, half days, and other days), in order. */
export async function calendarFor(db: Db, schoolId: string, date: string) {
  const year = await yearOf(db, schoolId, date);
  if (!year) return { year: null, days: [] };
  const days = await db.select().from(schoolDays).where(eq(schoolDays.schoolYearId, year.id)).orderBy(asc(schoolDays.date));
  return { year, days };
}

const dayInput = z.object({
  date: z.iso.date(),
  isInstructional: z.boolean(),
  dayType: z.enum(SCHOOL_DAY_KINDS),
  note: z.string().trim().max(120).nullable(),
});

/** Marks a day on the calendar (a day off, a half day, a school day on a weekend). */
export async function setSchoolDay(db: Db, viewer: StaffViewer, input: z.input<typeof dayInput>): Promise<Result<null>> {
  try {
    return await runStaffAction(db, viewer, { permission: "attendance.manage", input: dayInput }, async ({ tx, input: d, audit }) => {
      const year = await yearOf(tx, viewer.schoolId, d.date);
      if (!year) throw new Refused("That date isn't in a school year.");
      const [before] = await tx.select().from(schoolDays).where(and(eq(schoolDays.schoolId, viewer.schoolId), eq(schoolDays.date, d.date)));
      const values = { isInstructional: d.isInstructional, dayType: d.isInstructional ? d.dayType : "other", note: d.note };
      if (before) await tx.update(schoolDays).set(values).where(eq(schoolDays.id, before.id));
      else await tx.insert(schoolDays).values({ schoolId: viewer.schoolId, createdBy: viewer.userId, schoolYearId: year.id, date: d.date, ...values });
      await audit({ action: "school_day.set", entity: "school_days", entityId: before?.id ?? null,
        before: before ? { isInstructional: before.isInstructional, dayType: before.dayType, note: before.note } : null, after: { date: d.date, ...values } });
      return { ok: true as const, data: null };
    }, input);
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "Only ops, admins, and leaders change the calendar." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

/** Puts a day back to normal (weekday: school day; weekend: off). */
export async function clearSchoolDay(db: Db, viewer: StaffViewer, date: string): Promise<Result<null>> {
  try {
    return await runStaffAction(db, viewer, { permission: "attendance.manage", input: z.object({ date: z.iso.date() }) }, async ({ tx, input, audit }) => {
      const [row] = await tx.delete(schoolDays).where(and(eq(schoolDays.schoolId, viewer.schoolId), eq(schoolDays.date, input.date))).returning();
      if (!row) throw new Refused("That day isn't marked.");
      await audit({ action: "school_day.clear", entity: "school_days", entityId: row.id, before: { date: row.date, isInstructional: row.isInstructional, dayType: row.dayType, note: row.note } });
      return { ok: true as const, data: null };
    }, { date });
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "Only ops, admins, and leaders change the calendar." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}
