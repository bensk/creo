"use server";

import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { markAttendance } from "./take";

export async function markAttendanceAction(groupId: string, date: string, marks: { studentId: string; codeId: string }[]) {
  return markAttendance(getDb(), await requireViewer("staff"), { groupId, date, marks });
}
