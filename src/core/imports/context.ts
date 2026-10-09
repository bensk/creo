import { recordAudit } from "../audit/record";
import type { Db } from "../db/types";

/** What every import write needs: who is acting (a system user), when, and how to audit. */
export interface ImportContext {
  db: Db;
  schoolId: string;
  actorUserId: string;
  /** School-day date changes take effect (school time zone). */
  today: string;
  audit: (action: string, entity: string, entityId: string, before: unknown, after: unknown) => Promise<void>;
}

export function importContext(db: Db, schoolId: string, actorUserId: string, today: string): ImportContext {
  return {
    db, schoolId, actorUserId, today,
    audit: (action, entity, entityId, before, after) =>
      recordAudit(db, { schoolId, actorUserId, action, entity, entityId, before, after, via: "import" }),
  };
}

export function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Fields whose values differ, as before/after objects for the audit log. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const keys = (Object.keys(after) as (keyof T)[]).filter((k) => after[k] !== undefined && after[k] !== before[k]);
  return {
    changed: keys.length > 0,
    before: Object.fromEntries(keys.map((k) => [k, before[k]])),
    after: Object.fromEntries(keys.map((k) => [k, after[k]])),
  };
}
