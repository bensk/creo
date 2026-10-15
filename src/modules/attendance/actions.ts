"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { clearSchoolDay, setSchoolDay } from "./calendar";
import { updateCode } from "./codes";
import { signInLate } from "./desk";
import { markAttendance } from "./take";

export async function markAttendanceAction(groupId: string, date: string, marks: { studentId: string; codeId: string }[]) {
  return markAttendance(getDb(), await requireViewer("staff"), { groupId, date, marks });
}

export async function setSchoolDayAction(input: { date: string; isInstructional: boolean; dayType: "full" | "half" | "other"; note: string | null }) {
  const result = await setSchoolDay(getDb(), await requireViewer("staff"), input);
  revalidatePath("/attendance/calendar");
  return result;
}

export async function clearSchoolDayAction(date: string) {
  const result = await clearSchoolDay(getDb(), await requireViewer("staff"), date);
  revalidatePath("/attendance/calendar");
  return result;
}

export async function signInLateAction(studentId: string) {
  const result = await signInLate(getDb(), await requireViewer("staff"), studentId);
  revalidatePath("/attendance/late");
  return result;
}

export async function updateCodeAction(input: { id: string; label: string; sirsCode: string | null }) {
  const result = await updateCode(getDb(), await requireViewer("staff"), input);
  revalidatePath("/attendance/codes");
  return result;
}
