import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { Forbidden } from "@/core/permissions";
import { attendanceCodes } from "./schema";

// Attendance codes are data (P / T / A / E at Creo). Ops, admins, and leaders
// set each code's label and its NYSED SIRS code for state reporting.

const codeInput = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(60),
  sirsCode: z.string().trim().max(10).nullable(),
});

export async function updateCode(db: Db, viewer: StaffViewer, input: z.input<typeof codeInput>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await runStaffAction(db, viewer, { permission: "attendance.manage", input: codeInput }, async ({ tx, input: c, audit }) => {
      const [before] = await tx.select().from(attendanceCodes).where(and(eq(attendanceCodes.id, c.id), eq(attendanceCodes.schoolId, viewer.schoolId)));
      if (!before) throw new Refused("That code wasn't found.");
      await tx.update(attendanceCodes).set({ label: c.label, sirsCode: c.sirsCode || null }).where(eq(attendanceCodes.id, c.id));
      await audit({ action: "attendance_code.update", entity: "attendance_codes", entityId: c.id,
        before: { label: before.label, sirsCode: before.sirsCode }, after: { label: c.label, sirsCode: c.sirsCode || null } });
      return { ok: true as const };
    }, input);
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "Only ops, admins, and leaders change attendance codes." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}
