import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/core/db/types";
import { isDatabaseSynthetic } from "@/core/db/synthetic";
import { users } from "@/core/identity/schema";
import { recordAudit } from "@/core/audit/record";
import { CsvError, parseCsv } from "@/core/imports/csv";
import { importRuns } from "../integrations/schema";
import { enrolledStudentIds, studentIdsByOsis } from "../students/queries";
import { dayInfo } from "./calendar";
import { codeByLetter, ensureStandardCodes } from "./codes-standard";
import { attendanceDaily } from "./schema";

// Schoolrunner's "Daily Attendance Absence Export" (one file per day) → SIS
// attendance, and the parallel-run reconciliation. Students are matched by
// OSIS ("SIS Student Number"). A day the SIS has no mark for is filled in
// (source "import"); a mark staff entered in the SIS is never overwritten, and
// a disagreement is listed as a difference. Contact columns are never read.

const REQUIRED = ["SIS Student Number", "Date", "Absence Type Code"];
const TIME = /^(\d{1,2}):(\d{2})\b/;

export interface Difference {
  studentId: string;
  date: string;
  schoolrunner: string;
  sis: string;
}

export interface DayCounts {
  date: string;
  rows: number;
  imported: number;
  updated: number;
  agreed: number;
  differences: number;
  /** Enrolled in the SIS but not in Schoolrunner's file for that day. */
  missingFromSchoolrunner: number;
}

export interface SrAttendanceResult {
  days: DayCounts[];
  differences: Difference[];
  /** By file and line, never a student's details. */
  problems: string[];
  missing: { date: string; studentId: string }[];
  runId: string | null;
}

const ACTOR = "Schoolrunner import";

async function actorFor(db: Db, schoolId: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.kind, "system"), eq(users.displayName, ACTOR)));
  if (u) return u.id;
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, schoolId, createdBy: id, kind: "system", displayName: ACTOR });
  return id;
}

/** Arrival time from a comment like "9:15" on a tardy, as a timestamp in the school's time zone. */
function arrivalFrom(comment: string, date: string): Date | null {
  const m = TIME.exec(comment.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 6) h += 12; // "1:05" is after lunch, not 1 a.m.
  if (h > 23 || min > 59) return null;
  // New York's offset from UTC on that date (EST or EDT), from noon UTC.
  const probe = new Date(`${date}T12:00:00Z`);
  const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(probe));
  const offsetHours = 12 - nyHour;
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h + offsetHours, min));
}

class DryRun extends Error {}

export async function importSchoolrunnerAttendance(
  db: Db,
  files: { name: string; text: string }[],
  options: { schoolId: string; dryRun: boolean; actorUserId?: string },
): Promise<SrAttendanceResult | { refused: string }> {
  // Parse every file first; any file that can't be read stops everything.
  type Row = { file: string; line: number; osis: string; date: string; code: string; comment: string };
  const rows: Row[] = [];
  const problems: string[] = [];
  for (const f of files) {
    let table;
    try {
      table = parseCsv(f.text);
    } catch (error) {
      throw new CsvError(`${f.name}: ${error instanceof Error ? error.message : "can't be read"}`);
    }
    const missingCols = REQUIRED.filter((h) => !table.headers.includes(h));
    if (missingCols.length) throw new CsvError(`${f.name} is missing columns: ${missingCols.join(", ")}`);
    for (const { line, values: v } of table.rows) {
      const osisDigits = (v["SIS Student Number"] ?? "").replace(/\D/g, "");
      const osis = osisDigits ? osisDigits.padStart(9, "0") : "";
      const date = (v.Date ?? "").trim();
      const code = (v["Absence Type Code"] ?? "").trim().toUpperCase();
      if ((v["Absence Active"] ?? "1").trim() === "0") continue; // withdrawn in Schoolrunner
      if (!/^\d{9}$/.test(osis)) { problems.push(`${f.name} line ${line}: SIS Student Number isn't a 9-digit OSIS`); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { problems.push(`${f.name} line ${line}: Date isn't YYYY-MM-DD`); continue; }
      if (!code) { problems.push(`${f.name} line ${line}: no attendance code`); continue; }
      rows.push({ file: f.name, line, osis, date, code, comment: v.Comments ?? "" });
    }
  }

  // Real data only in a real database (same rule as the Clever import).
  const [dbRow] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  const synthetic = (await isDatabaseSynthetic(db)) || dbRow?.name === "creo_dev" || /_(dev|test|staging)$/.test(dbRow?.name ?? "");
  if (synthetic && rows.some((r) => !r.osis.startsWith("999"))) {
    return { refused: "This database holds synthetic data only, and these files contain real OSIS numbers. Upload them in production." };
  }

  const result: SrAttendanceResult = { days: [], differences: [], problems, missing: [], runId: null };
  const actor = options.actorUserId ?? (await actorFor(db, options.schoolId));
  const run = options.dryRun ? null
    : (await db.insert(importRuns).values({ schoolId: options.schoolId, createdBy: actor, source: "schoolrunner", kind: "attendance" }).returning({ id: importRuns.id }))[0]!;

  try {
    await db.transaction(async (tx) => {
      await ensureStandardCodes(tx, options.schoolId, actor);
      const codes = await codeByLetter(tx, options.schoolId);
      const byOsis = await studentIdsByOsis(tx, options.schoolId, [...new Set(rows.map((r) => r.osis))]);
      const audit = (action: string, entityId: string, before: unknown, after: unknown) =>
        recordAudit(tx, { schoolId: options.schoolId, actorUserId: actor, action, entity: "attendance_daily", entityId, before, after, via: "import" });

      for (const date of [...new Set(rows.map((r) => r.date))].sort()) {
        const dayRows = rows.filter((r) => r.date === date);
        const counts: DayCounts = { date, rows: dayRows.length, imported: 0, updated: 0, agreed: 0, differences: 0, missingFromSchoolrunner: 0 };
        if (!(await dayInfo(tx, options.schoolId, date)).isSchoolDay) {
          problems.push(`${date}: not a school day on the SIS calendar; skipped`);
          result.days.push(counts);
          continue;
        }
        const ids = dayRows.map((r) => byOsis.get(r.osis)).filter((x): x is string => Boolean(x));
        const existing = new Map((ids.length ? await tx.select().from(attendanceDaily).where(and(eq(attendanceDaily.date, date), inArray(attendanceDaily.studentId, ids))) : [])
          .map((r) => [r.studentId, r]));
        const seen = new Set<string>();
        for (const r of dayRows) {
          const studentId = byOsis.get(r.osis);
          if (!studentId) { problems.push(`${r.file} line ${r.line}: no SIS student with that OSIS`); continue; }
          const code = codes.get(r.code);
          if (!code) { problems.push(`${r.file} line ${r.line}: code ${r.code} isn't an SIS code`); continue; }
          seen.add(studentId);
          const arrivedAt = code.countsAs === "tardy" ? arrivalFrom(r.comment, date) : null;
          const before = existing.get(studentId);
          if (!before) {
            const [row] = await tx.insert(attendanceDaily).values({ schoolId: options.schoolId, createdBy: actor, studentId, date, codeId: code.id, arrivedAt, source: "import" })
              .returning({ id: attendanceDaily.id });
            await audit("attendance.import", row!.id, null, { code: code.code, studentId, date });
            counts.imported++;
          } else if (before.source === "import") {
            if (before.codeId === code.id) { counts.agreed++; continue; }
            await tx.update(attendanceDaily).set({ codeId: code.id, arrivedAt: arrivedAt ?? before.arrivedAt }).where(eq(attendanceDaily.id, before.id));
            await audit("attendance.import_update", before.id, { codeId: before.codeId }, { code: code.code });
            counts.updated++;
          } else if (before.codeId === code.id) {
            counts.agreed++;
          } else {
            // Entered in the SIS: never overwritten; this is the reconciliation.
            const sisCode = [...codes.values()].find((c) => c.id === before.codeId)?.code ?? "?";
            result.differences.push({ studentId, date, schoolrunner: code.code, sis: sisCode });
            counts.differences++;
          }
        }
        // Enrolled students Schoolrunner has nothing for that day.
        const enrolledNow = await enrolledStudentIds(tx, options.schoolId);
        const missing = enrolledNow.filter((id) => !seen.has(id));
        for (const id of missing) result.missing.push({ date, studentId: id });
        counts.missingFromSchoolrunner = missing.length;
        result.days.push(counts);
      }
      if (options.dryRun) throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) {
      if (run) await db.update(importRuns).set({ status: "failed", finishedAt: new Date(), errorSummary: error instanceof Error ? error.message : "Import failed" }).where(eq(importRuns.id, run.id));
      throw error;
    }
  }
  if (run) {
    await db.update(importRuns).set({
      status: "succeeded", finishedAt: new Date(),
      counts: { days: result.days, differences: result.differences.length, problems: result.problems.length },
      errorSummary: result.problems.length ? result.problems.slice(0, 50).join("\n") : null,
    }).where(eq(importRuns.id, run.id));
    result.runId = run.id;
  }
  return result;
}
