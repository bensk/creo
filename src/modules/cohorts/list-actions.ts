"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { shareItem, unshareItem } from "@/core/sharing/manage";
import { addListMembers, asShareable, createList, getList, removeListMember, updateList, type listInput, type listUpdate } from "./lists";

export async function createListAction(input: z.input<typeof listInput>) {
  const result = await createList(getDb(), await requireViewer("staff"), input);
  if (result.ok) revalidatePath("/lists");
  return result;
}

export async function updateListAction(input: z.input<typeof listUpdate>) {
  const result = await updateList(getDb(), await requireViewer("staff"), input);
  revalidatePath(`/lists/${input.id}`);
  return result;
}

export async function addListMembersAction(listId: string, studentIds: string[]) {
  const result = await addListMembers(getDb(), await requireViewer("staff"), { listId, studentIds });
  revalidatePath(`/lists/${listId}`);
  return result;
}

export async function removeListMemberAction(listId: string, studentId: string) {
  const result = await removeListMember(getDb(), await requireViewer("staff"), { listId, studentId });
  revalidatePath(`/lists/${listId}`);
  return result;
}

export async function shareListAction(listId: string, target: { userId: string } | { googleGroupEmail: string }, access: "view" | "edit") {
  const viewer = await requireViewer("staff");
  const db = getDb();
  const found = await getList(db, viewer, listId);
  if (!found) return { ok: false as const, error: "That list wasn't found." };
  const result = await shareItem(db, viewer, asShareable(found.list), "cohorts.create_lists", await can(db, viewer, "cohorts.view_all_lists"), { target, access });
  revalidatePath(`/lists/${listId}`);
  return result;
}

export async function unshareListAction(listId: string, shareId: string) {
  const viewer = await requireViewer("staff");
  const db = getDb();
  const found = await getList(db, viewer, listId);
  if (!found) return { ok: false as const, error: "That list wasn't found." };
  const result = await unshareItem(db, viewer, asShareable(found.list), "cohorts.create_lists", await can(db, viewer, "cohorts.view_all_lists"), shareId);
  revalidatePath(`/lists/${listId}`);
  return result;
}
