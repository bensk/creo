import { buildAttendanceSeed } from "../../modules/attendance/seed";
import { buildBehaviorSeed } from "../../modules/behavior/seed";
import { buildCohortsSeed } from "../../modules/cohorts/seed";
import { buildStudentsSeed } from "../../modules/students/seed";
import { buildCoreSeed } from "./core";
import { createRng } from "./random";
import type { SeedBatch } from "./types";

export const SEED = 20260908;

/**
 * Builds every seed row in memory, in insert order. Pure and deterministic: the
 * same seed always yields the same rows and ids. Each module contributes its
 * own builder; add new ones here when a module's schema lands.
 */
export function buildSeed(seed = SEED): SeedBatch[] {
  const core = buildCoreSeed(createRng(seed));
  const studentsSeed = buildStudentsSeed(core.context);
  return [
    ...core.batches,
    ...studentsSeed.batches,
    ...buildCohortsSeed(core.context, studentsSeed.placements),
    ...buildAttendanceSeed(core.context, studentsSeed.placements),
    ...buildBehaviorSeed(core.context, studentsSeed.placements),
  ];
}
