import { SEED_HISTORY_THROUGH, schoolDays, type SeedBatch, type SeedContext, type StudentPlacement } from "../../core/seed/types";
import { attendanceCodes, attendanceDaily } from "./schema";

const CODES = [
  { code: "P", label: "Present", countsAs: "present" },
  { code: "T", label: "Tardy", countsAs: "tardy" },
  { code: "A", label: "Absent", countsAs: "absent" },
  { code: "E", label: "Excused absence", countsAs: "excused" },
] as const;

/**
 * Codes plus daily homeroom attendance from the first day through
 * SEED_HISTORY_THROUGH. Most students attend 92–99% of days; about one in eight
 * is chronically absent (under 90%), so absence views have something to find.
 */
export function buildAttendanceSeed(ctx: SeedContext, placements: readonly StudentPlacement[]): SeedBatch[] {
  const { rng } = ctx;
  const by = { schoolId: ctx.schoolId, createdBy: ctx.systemUserId };
  const codeIds = Object.fromEntries(CODES.map((c) => [c.code, rng.uuid()])) as Record<(typeof CODES)[number]["code"], string>;
  const days = schoolDays(ctx.yearStartsOn, SEED_HISTORY_THROUGH);

  const rows: Record<string, unknown>[] = [];
  for (const p of placements) {
    const chronic = !p.fixed && rng.chance(0.12);
    const absenceRate = chronic ? 0.11 + rng.next() * 0.12 : 0.01 + rng.next() * 0.06;
    const tardyRate = rng.next() * 0.08;
    for (const date of days) {
      if (p.withdrawnOn && date > p.withdrawnOn) break;
      const roll = rng.next();
      const code = roll < absenceRate ? (rng.chance(0.3) ? "E" : "A") : roll < absenceRate + tardyRate ? "T" : "P";
      rows.push({ id: rng.uuid(), ...by, studentId: p.studentId, date, codeId: codeIds[code], source: "sis" });
    }
  }

  return [
    { table: attendanceCodes, rows: CODES.map((c, i) => ({ id: codeIds[c.code], ...by, ...c, position: i })) },
    { table: attendanceDaily, rows },
  ];
}
