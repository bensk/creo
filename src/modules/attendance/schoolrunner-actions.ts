"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/core/audit/record";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { CsvError } from "@/core/imports/csv";
import { authorize, Forbidden } from "@/core/permissions";
import { displayName } from "@/core/ui/StudentName";
import { rosterFor } from "../students/queries";
import { importSchoolrunnerAttendance, type DayCounts } from "./schoolrunner";

export type SrActionResult =
  | { ok: true; days: DayCounts[]; differences: { name: string; date: string; schoolrunner: string; sis: string; studentId: string }[]; missing: { name: string; date: string }[]; problems: string[] }
  | { ok: false; error: string };

const MAX_BYTES = 8 * 1024 * 1024;

async function run(form: FormData, dryRun: boolean): Promise<SrActionResult> {
  const viewer = await requireViewer("staff");
  const db = getDb();
  try {
    await authorize(db, viewer, "integrations.run_imports");
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "Only admins and ops can run imports." };
    throw error;
  }
  const files: { name: string; text: string }[] = [];
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (entry.size > MAX_BYTES) return { ok: false, error: `${entry.name} is larger than 8 MB.` };
    files.push({ name: entry.name, text: await entry.text() });
  }
  if (!files.length) return { ok: false, error: "Choose at least one Daily Attendance export." };
  try {
    const result = await importSchoolrunnerAttendance(db, files, { schoolId: viewer.schoolId, dryRun });
    if ("refused" in result) return { ok: false, error: result.refused };
    if (!dryRun) {
      await recordAudit(db, { schoolId: viewer.schoolId, actorUserId: viewer.userId, action: "import.schoolrunner_attendance", entity: "import_runs", entityId: result.runId, after: { days: result.days.map((d) => d.date) }, via: "app" });
      revalidatePath("/imports");
    }
    const names = new Map((await rosterFor(db, viewer.schoolId, [...new Set([...result.differences, ...result.missing].map((d) => d.studentId))])).map((r) => [r.id, displayName(r)]));
    return {
      ok: true, days: result.days, problems: result.problems,
      differences: result.differences.map((d) => ({ ...d, name: names.get(d.studentId) ?? "Unknown student" })),
      missing: result.missing.slice(0, 200).map((m) => ({ date: m.date, name: names.get(m.studentId) ?? "Unknown student" })),
    };
  } catch (error) {
    if (error instanceof CsvError) return { ok: false, error: error.message };
    console.error("schoolrunner attendance import failed", { schoolId: viewer.schoolId, error: error instanceof Error ? error.name : "unknown" });
    return { ok: false, error: "The import failed and nothing was changed." };
  }
}

export async function previewSrAttendanceAction(form: FormData) {
  return run(form, true);
}

export async function importSrAttendanceAction(form: FormData) {
  return run(form, false);
}
