"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { shareItem, unshareItem } from "@/core/sharing/manage";
import { asShareable, canEdit, getTracker, trackerOversight } from "./access";
import {
  addTrackerField, addTrackerRows, archiveTrackerField, createTracker, removeTrackerRow, saveTrackerTemplate, setTrackerCell, updateTracker,
  type trackerInput, type trackerUpdate,
} from "./manage";
import { populationSchema, type FieldSpec, type Population } from "./model";
import { resolvePopulation } from "./population";
import { loadTrackerTable } from "./table";

export async function previewPopulationAction(population: Population): Promise<{ ok: true; count: number; sensitivity: string } | { ok: false; error: string }> {
  const viewer = await requireViewer("staff");
  const parsed = populationSchema.safeParse(population);
  if (!parsed.success) return { ok: false, error: "Choose who the tracker is for." };
  const r = await resolvePopulation(getDb(), viewer, parsed.data);
  return r.ok ? { ok: true, count: r.studentIds.length, sensitivity: r.sensitivity } : r;
}

export async function createTrackerAction(input: z.input<typeof trackerInput>) {
  const result = await createTracker(getDb(), await requireViewer("staff"), input);
  if (result.ok) revalidatePath("/trackers");
  return result;
}

export async function setTrackerCellAction(input: { trackerId: string; rowId: string; key: string; value: unknown; expected: unknown }) {
  return setTrackerCell(getDb(), await requireViewer("staff"), input);
}

export async function addTrackerFieldAction(trackerId: string, field: FieldSpec) {
  const result = await addTrackerField(getDb(), await requireViewer("staff"), { trackerId, field });
  revalidatePath(`/trackers/${trackerId}`);
  return result;
}

export async function archiveTrackerFieldAction(trackerId: string, key: string) {
  const result = await archiveTrackerField(getDb(), await requireViewer("staff"), { trackerId, key });
  revalidatePath(`/trackers/${trackerId}`);
  return result;
}

export async function addTrackerRowsAction(trackerId: string, studentIds: string[]) {
  const result = await addTrackerRows(getDb(), await requireViewer("staff"), { trackerId, studentIds });
  revalidatePath(`/trackers/${trackerId}`);
  return result;
}

export async function removeTrackerRowAction(trackerId: string, rowId: string) {
  const result = await removeTrackerRow(getDb(), await requireViewer("staff"), { trackerId, rowId });
  revalidatePath(`/trackers/${trackerId}`);
  return result;
}

export async function updateTrackerAction(input: z.input<typeof trackerUpdate>) {
  const result = await updateTracker(getDb(), await requireViewer("staff"), input);
  revalidatePath(`/trackers/${input.id}`);
  return result;
}

export async function saveTrackerTemplateAction(trackerId: string, name: string, sharedWithSchool: boolean) {
  return saveTrackerTemplate(getDb(), await requireViewer("staff"), { trackerId, name, sharedWithSchool });
}

export async function shareTrackerAction(trackerId: string, target: { userId: string } | { googleGroupEmail: string }, access: "view" | "edit") {
  const viewer = await requireViewer("staff");
  const db = getDb();
  const found = await getTracker(db, viewer, trackerId);
  if (!found) return { ok: false as const, error: "That tracker wasn't found." };
  const result = await shareItem(db, viewer, asShareable(found.tracker), "trackers.create", await trackerOversight(db, viewer), { target, access });
  revalidatePath(`/trackers/${trackerId}`);
  return result;
}

export async function unshareTrackerAction(trackerId: string, shareId: string) {
  const viewer = await requireViewer("staff");
  const db = getDb();
  const found = await getTracker(db, viewer, trackerId);
  if (!found) return { ok: false as const, error: "That tracker wasn't found." };
  const result = await unshareItem(db, viewer, asShareable(found.tracker), "trackers.create", await trackerOversight(db, viewer), shareId);
  revalidatePath(`/trackers/${trackerId}`);
  return result;
}

/** Re-reads rows someone else changed, as this viewer may see them (for live updates). */
export async function trackerRowsAction(trackerId: string, rowIds: string[]) {
  const viewer = await requireViewer("staff");
  const db = getDb();
  const found = await getTracker(db, viewer, trackerId);
  if (!found || rowIds.length > 500) return null;
  return (await loadTrackerTable(db, viewer, found.tracker, canEdit(found.access), rowIds)).rows;
}
