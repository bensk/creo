import "server-only";
import type { z } from "zod";
import { requireViewer } from "../auth/server";
import { getDb } from "../db/client";
import { runStaffAction, type ActionContext, type StaffActionOptions } from "./run";

/**
 * Defines a staff server action. Every staff server action goes through this:
 * it requires a valid staff session, validates input with Zod, checks the
 * permission (default deny), runs in one transaction, and refuses to commit a
 * write that recorded no audit entry.
 *
 *   export const renameGroup = staffAction(
 *     { permission: "cohorts.manage", input: z.object({ groupId: z.uuid(), name: z.string().min(1) }) },
 *     async ({ tx, input, audit }) => { ...; await audit({ action: "group.rename", entity: "groups", ... }) },
 *   );
 */
export function staffAction<S extends z.ZodType, O>(
  options: StaffActionOptions<S>,
  handler: (ctx: ActionContext<z.infer<S>>) => Promise<O>,
): (input: z.input<S>) => Promise<O> {
  return async (input) => {
    const viewer = await requireViewer("staff");
    return runStaffAction(getDb(), viewer, options, handler, input);
  };
}
