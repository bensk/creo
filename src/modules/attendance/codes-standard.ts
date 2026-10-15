import { and, eq } from "drizzle-orm";
import type { Db } from "@/core/db/types";
import { attendanceCodes } from "./schema";

// Creo's attendance codes (Ben, Oct 15 2026): homeroom marks P / T / A / E;
// ET, ISS, and OSS come from Schoolrunner and the office. All staff see them.
export const STANDARD_CODES = [
  { code: "P", label: "Present", countsAs: "present" },
  { code: "T", label: "Tardy", countsAs: "tardy" },
  { code: "A", label: "Absent", countsAs: "absent" },
  { code: "E", label: "Excused absence", countsAs: "excused" },
  { code: "ET", label: "Excused tardy", countsAs: "tardy" },
  { code: "ISS", label: "In-school suspension", countsAs: "present" },
  { code: "OSS", label: "Out-of-school suspension", countsAs: "excused" },
] as const;

/** Creates any standard code the school doesn't have yet (labels and SIRS codes already set are kept). */
export async function ensureStandardCodes(db: Db, schoolId: string, actorUserId: string): Promise<number> {
  const existing = new Set((await db.select({ code: attendanceCodes.code }).from(attendanceCodes).where(eq(attendanceCodes.schoolId, schoolId))).map((r) => r.code));
  const missing = STANDARD_CODES.map((c, position) => ({ ...c, position })).filter((c) => !existing.has(c.code));
  if (missing.length) await db.insert(attendanceCodes).values(missing.map((c) => ({ schoolId, createdBy: actorUserId, ...c }))).onConflictDoNothing();
  return missing.length;
}

export async function codeByLetter(db: Db, schoolId: string) {
  const rows = await db.select().from(attendanceCodes).where(and(eq(attendanceCodes.schoolId, schoolId)));
  return new Map(rows.map((r) => [r.code.toUpperCase(), r]));
}
