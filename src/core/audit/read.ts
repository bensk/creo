import { and, desc, eq, type SQL } from "drizzle-orm";
import type { Viewer } from "../auth/viewer";
import type { Db } from "../db/types";
import { authorize } from "../permissions";
import { ROLE_SENSITIVITY } from "../permissions/matrix";
import type { Sensitivity } from "../permissions/sensitivity";
import { registry } from "../../modules";
import { auditLog } from "./schema";

const REDACTED = "[redacted]";

/** Levels a viewer sees for every student (role "all" grants only; assignment-based access is not applied). */
function schoolWideLevels(viewer: Viewer): Set<Sensitivity> {
  const levels = new Set<Sensitivity>();
  if (viewer.kind !== "staff") return levels;
  for (const role of viewer.roles) ROLE_SENSITIVITY[role].all.forEach((l) => levels.add(l));
  return levels;
}

function redactValues(value: unknown, fields: Record<string, Sensitivity> | undefined, levels: Set<Sensitivity>): unknown {
  if (!fields || value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => {
      const level = fields[key];
      return [key, level && !levels.has(level) ? REDACTED : v];
    }),
  );
}

/**
 * Reads the change log. Admin and leaders only (core.audit.read). Before/after
 * values above the reader's school-wide sensitivity are replaced with "[redacted]".
 */
export async function readAuditLog(
  db: Db,
  viewer: Viewer,
  filter: { entity?: string; entityId?: string; limit?: number } = {},
) {
  await authorize(db, viewer, "core.audit.read");
  const conditions: SQL[] = [eq(auditLog.schoolId, viewer.schoolId)];
  if (filter.entity) conditions.push(eq(auditLog.entity, filter.entity));
  if (filter.entityId) conditions.push(eq(auditLog.entityId, filter.entityId));
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.at))
    .limit(Math.min(filter.limit ?? 100, 500));

  const levels = schoolWideLevels(viewer);
  const declared = (entity: string) => registry.modules.find((m) => m.fieldSensitivity?.[entity])?.fieldSensitivity?.[entity];
  return rows.map((row) => ({
    ...row,
    before: redactValues(row.before, declared(row.entity), levels),
    after: redactValues(row.after, declared(row.entity), levels),
  }));
}
