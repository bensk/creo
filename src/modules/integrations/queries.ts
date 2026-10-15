import { desc, eq } from "drizzle-orm";
import type { Db } from "@/core/db/types";
import { importRuns } from "./schema";

/** Recent import runs, newest first. Counts and row-numbered problems only, never student details. */
export async function recentImportRuns(db: Db, schoolId: string, limit = 15) {
  return db
    .select({ id: importRuns.id, source: importRuns.source, status: importRuns.status, startedAt: importRuns.startedAt, finishedAt: importRuns.finishedAt, counts: importRuns.counts })
    .from(importRuns)
    .where(eq(importRuns.schoolId, schoolId))
    .orderBy(desc(importRuns.startedAt))
    .limit(limit);
}
