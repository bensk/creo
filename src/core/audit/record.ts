import type { AUDIT_VIA } from "./schema";
import { auditLog } from "./schema";
import type { Db } from "../db/types";

export type AuditVia = (typeof AUDIT_VIA)[number];

export interface AuditEntry {
  schoolId: string;
  actorUserId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  via: AuditVia;
  requestId?: string | null;
}

/** Write one audit row. Call with the same transaction as the change it records. */
export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    ...entry,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    requestId: entry.requestId ?? null,
  });
}
