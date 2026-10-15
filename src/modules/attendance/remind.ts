import type { Db } from "@/core/db/types";
import { groupStaffMembers } from "../cohorts/queries";
import type { SlackApi } from "../slack/client";
import { notify } from "../slack/notify";
import { dayInfo } from "./calendar";
import { attendanceProgress } from "./take";

/**
 * Reminds each homeroom teacher whose homeroom isn't finished today, through
 * the Slack rules for "attendance.not_taken" (a DM to the staff member it's
 * about). Counts only: no student names. Does nothing on days off.
 */
export async function remindNotTaken(db: Db, schoolId: string, today: string, api?: SlackApi) {
  if (!(await dayInfo(db, schoolId, today)).isSchoolDay) return { homerooms: 0, sent: 0 };
  const open = (await attendanceProgress(db, schoolId, today)).filter((h) => h.students > 0 && h.marked < h.students);
  let sent = 0;
  for (const h of open) {
    for (const teacher of (await groupStaffMembers(db, h.id)).filter((s) => s.function === "homeroom_teacher")) {
      const delivered = await notify(db, schoolId, "attendance.not_taken", {
        headline: `${h.name} attendance isn't finished: ${h.marked} of ${h.students} marked.`,
        path: `/attendance?homeroom=${h.id}`,
        ownerStaffId: teacher.staffId,
      }, api);
      sent += delivered.length;
    }
  }
  return { homerooms: open.length, sent };
}
