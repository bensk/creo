"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import {
  addGroupMembers, addGroupStaff, createGroup, removeGroupMember, removeGroupStaff, updateGroup,
  type groupInput, type groupUpdate,
} from "./manage";
import type { z } from "zod";

async function run<T>(work: (viewer: Awaited<ReturnType<typeof requireViewer<"staff">>>) => Promise<T>, path: string) {
  const result = await work(await requireViewer("staff"));
  revalidatePath(path);
  return result;
}

export async function createGroupAction(input: z.input<typeof groupInput>) {
  return run((v) => createGroup(getDb(), v, input), "/groups");
}
export async function updateGroupAction(input: z.input<typeof groupUpdate>) {
  return run((v) => updateGroup(getDb(), v, input), `/groups/${input.id}`);
}
export async function addGroupMembersAction(groupId: string, studentIds: string[]) {
  return run((v) => addGroupMembers(getDb(), v, { groupId, studentIds }), `/groups/${groupId}`);
}
export async function removeGroupMemberAction(groupId: string, studentId: string) {
  return run((v) => removeGroupMember(getDb(), v, { groupId, studentId }), `/groups/${groupId}`);
}
export async function addGroupStaffAction(groupId: string, staffId: string, fn: "homeroom_teacher" | "lead" | "member") {
  return run((v) => addGroupStaff(getDb(), v, { groupId, staffId, function: fn }), `/groups/${groupId}`);
}
export async function removeGroupStaffAction(groupId: string, groupStaffId: string) {
  return run((v) => removeGroupStaff(getDb(), v, groupStaffId), `/groups/${groupId}`);
}
