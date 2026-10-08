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
}
