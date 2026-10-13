"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffAction } from "@/core/actions/staff-action";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { displayName, pronunciationAudioUrl } from "@/core/ui/StudentName";
import { currentHomerooms } from "../cohorts/queries";
import { savePronunciation } from "./pronunciation";
import { searchStudents } from "./queries";

/** Student search for the command palette. Read-only; standard fields only. */
export const searchStudentsAction = staffAction(
  { permission: "students.view", input: z.object({ query: z.string().trim().min(1).max(60) }), readOnly: true },
  async ({ tx, viewer, input }) => {
    const found = await searchStudents(tx, viewer.schoolId, input.query);
    const homerooms = await currentHomerooms(tx, found.map((s) => s.id));
    return found.map((s) => ({
      id: s.id,
      name: displayName(s),
      nameParts: {
        legalFirstName: s.legalFirstName, legalLastName: s.legalLastName,
        preferredFirstName: s.preferredFirstName, preferredLastName: s.preferredLastName,
      },
      phonetic: s.phonetic,
      audioUrl: s.audioId ? pronunciationAudioUrl(s.audioId) : null,
      grade: s.grade,
      homeroom: homerooms.get(s.id) ?? null,
      enrolled: s.enrolled,
    }));
  },
);

/** Saves a phonetic spelling and/or a recording from the profile's pronunciation editor. */
export async function savePronunciationAction(form: FormData) {
  const viewer = await requireViewer("staff");
  const file = form.get("audio");
  const audio = file instanceof File && file.size > 0 ? { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type } : undefined;
  const mode = form.get("mode");
  const result = await savePronunciation(getDb(), viewer, {
    studentId: String(form.get("studentId") ?? ""),
    phonetic: typeof form.get("phonetic") === "string" ? (form.get("phonetic") as string) : null,
    audio: mode === "new" || mode === "remove" ? mode : "keep",
  }, audio);
  if (result.ok) revalidatePath(`/students/${String(form.get("studentId"))}`);
  return result;
}
