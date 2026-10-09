import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "../db/types";
import type { StaffPersona } from "./personas";
import type { Rng } from "./random";

export type SeedDb = Db;

/** Rows for one table, inserted in the order batches are listed. */
export interface SeedBatch {
  table: PgTable;
  rows: Record<string, unknown>[];
}

export type Grade = 5 | 6 | 7 | 8;
export const GRADES: readonly Grade[] = [5, 6, 7, 8];

export interface SeedStaff {
  id: string;
  personaKey?: string;
  homeroom?: string;
  gradeTeam?: StaffPersona["gradeTeam"];
}

/** Built by the core seed and handed to module seeds. */
export interface SeedContext {
  rng: Rng;
  schoolId: string;
  systemUserId: string;
  schoolYearId: string;
  yearStartsOn: string;
  staff: readonly SeedStaff[];
}

/** Where each student sits, produced by the students seed for the cohorts seed. */
export interface StudentPlacement {
  studentId: string;
  grade: Grade;
  homeroom: string;
  /** Last day enrolled, for withdrawn students. */
  withdrawnOn?: string;
  /** Personas and the staff-parent's child keep a fixed homeroom. */
  fixed: boolean;
  firstName: string;
  pronouns: string;
  familyLanguage: "en" | "es";
}

/** Seeded history runs through this date, so the seed never depends on today's date. */
export const SEED_HISTORY_THROUGH = "2026-10-09";
/** No school these weekdays (NYC calendar). */
export const SEED_NO_SCHOOL = new Set(["2026-09-21"]);

/** Instructional days from start through end, inclusive. */
export function schoolDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const weekday = d.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !SEED_NO_SCHOOL.has(iso)) days.push(iso);
  }
  return days;
}
