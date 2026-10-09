import { sensitiveReads } from "../audit/schema";
import type { AuditVia } from "../audit/record";
import type { Viewer } from "../auth/viewer";
import type { Db } from "../db/types";
import { fieldSensitivityFor, redact, visibleLevels } from "./index";

/**
 * Prepares one student-data row for a viewer: drops fields above their
 * sensitivity for that student, and logs every above-standard field shown
 * (sensitive_reads). Every read of student data that can include restricted,
 * sensitive, or confidential fields goes through here.
 */
export async function readForViewer<T extends Record<string, unknown>>(
  db: Db,
  viewer: Viewer,
  table: string,
  studentId: string,
  row: T,
  options: { entityId?: string; via?: AuditVia } = {},
): Promise<Partial<T>> {
  const levels = await visibleLevels(db, viewer, studentId);
  const { row: visible, sensitiveFieldsShown } = redact(row, fieldSensitivityFor(table), levels);
  if (sensitiveFieldsShown.length > 0) {
    await db.insert(sensitiveReads).values(
      sensitiveFieldsShown.map((field) => ({
        schoolId: viewer.schoolId, actorUserId: viewer.userId, entity: table,
        entityId: options.entityId ?? studentId, field, via: options.via ?? "app",
      })),
    );
  }
  return visible;
}
