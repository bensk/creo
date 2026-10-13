"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/core/audit/record";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { CsvError } from "@/core/imports/csv";
import { authorize, Forbidden } from "@/core/permissions";
import { fieldContext } from "@/core/query/run";
import { importClever, type CleverResult } from "./import";
import { CLEVER_FILES, type CleverFile } from "./map";

export type CleverActionResult = { ok: true; result: CleverResult } | { ok: false; error: string };

const MAX_FILE_BYTES = 8 * 1024 * 1024;

async function readFiles(form: FormData): Promise<Partial<Record<CleverFile, string>> | string> {
  const files: Partial<Record<CleverFile, string>> = {};
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File)) continue;
    const name = entry.name.toLowerCase().replace(/^.*[\\/]/, "").replace(/\.csv$/, "") as CleverFile;
    if (!CLEVER_FILES.includes(name)) return `“${entry.name}” isn't one of Clever's files (${CLEVER_FILES.map((f) => `${f}.csv`).join(", ")}).`;
    if (entry.size > MAX_FILE_BYTES) return `${entry.name} is larger than 8 MB.`;
    files[name] = await entry.text();
  }
  const missing = CLEVER_FILES.filter((f) => files[f] === undefined);
  if (missing.length) return `Add all six files. Missing: ${missing.map((f) => `${f}.csv`).join(", ")}.`;
  return files;
}

async function runClever(form: FormData, dryRun: boolean): Promise<CleverActionResult> {
  const viewer = await requireViewer("staff");
  const db = getDb();
  try {
    await authorize(db, viewer, "integrations.run_imports");
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "Only admins and ops can run imports." };
    throw error;
  }
  const files = await readFiles(form);
  if (typeof files === "string") return { ok: false, error: files };
  const { today } = await fieldContext(db, viewer.schoolId);
  try {
    const result = await importClever(db, files, { schoolId: viewer.schoolId, today, dryRun });
    if ("refused" in result) return { ok: false, error: result.refused };
    if (!dryRun) {
      // Who ran it; the import's own changes are audited under the "Clever import" system user.
      await recordAudit(db, {
        schoolId: viewer.schoolId, actorUserId: viewer.userId, action: "import.clever", entity: "import_runs",
        entityId: result.runId, after: { counts: result.counts }, via: "app",
      });
      revalidatePath("/imports");
    }
    return { ok: true, result };
  } catch (error) {
    if (error instanceof CsvError) return { ok: false, error: error.message };
    // IDs only in logs: the files hold student data.
    console.error("clever import failed", { schoolId: viewer.schoolId, error: error instanceof Error ? error.name : "unknown" });
    return { ok: false, error: "The import failed and nothing was changed. Try again, or ask Ben to look at the server log." };
  }
}

/** Runs the whole import and rolls it back: exact counts, nothing saved. */
export async function previewCleverAction(form: FormData) {
  return runClever(form, true);
}

export async function applyCleverAction(form: FormData) {
  return runClever(form, false);
}
