import type { z } from "zod";
import { recordAudit, type AuditEntry } from "../audit/record";
import type { StaffViewer } from "../auth/viewer";
import type { Db } from "../db/types";
import { authorize } from "../permissions";

export type AuditInput = Omit<AuditEntry, "schoolId" | "actorUserId" | "via">;

export interface ActionContext<I> {
  viewer: StaffViewer;
  /** The transaction the whole action runs in. Use it for every read and write. */
  tx: Db;
  input: I;
  /** Record a change in the same transaction. Required at least once for a writing action. */
  audit: (entry: AuditInput) => Promise<void>;
}

export interface StaffActionOptions<S extends z.ZodType> {
  permission: string;
  input: S;
  /** Which student the action is about, when the permission is scoped (e.g. homeroom only). */
  target?: (input: z.infer<S>) => { studentId?: string };
  /** Set for actions that change nothing; they need no audit entry. */
  readOnly?: boolean;
}

export class InvalidInput extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid input");
  }
}

/**
 * An action declining to do something (a duplicate name, a stale version).
 * Throw it from a handler instead of returning: nothing was written, so no
 * audit entry is expected, and the caller shows the message as is.
 */
export class Refused extends Error {}

export class UnauditedWrite extends Error {
  constructor(permission: string) {
    super(`Action "${permission}" finished without an audit entry; its changes were rolled back`);
  }
}

/**
 * The core of every staff server action: validate input, check permission,
 * run in one transaction, and require an audit entry for writes. Kept free of
 * Next.js so it can be tested directly; staffAction() adds the session.
 */
export async function runStaffAction<S extends z.ZodType, O>(
  db: Db,
  viewer: StaffViewer,
  options: StaffActionOptions<S>,
  handler: (ctx: ActionContext<z.infer<S>>) => Promise<O>,
  rawInput: unknown,
): Promise<O> {
  const parsed = options.input.safeParse(rawInput);
  if (!parsed.success) throw new InvalidInput(parsed.error.issues);
  const input = parsed.data as z.infer<S>;

  await authorize(db, viewer, options.permission, options.target?.(input));

  return db.transaction(async (tx) => {
    let audited = 0;
    const audit = async (entry: AuditInput) => {
      audited++;
      await recordAudit(tx, { ...entry, schoolId: viewer.schoolId, actorUserId: viewer.userId, via: "app" });
    };
    const result = await handler({ viewer, tx, input, audit });
    if (!options.readOnly && audited === 0) throw new UnauditedWrite(options.permission);
    return result;
  });
}
