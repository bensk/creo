import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { Refused, runStaffAction } from "@/core/actions/run";
import type { StaffViewer } from "@/core/auth/viewer";
import type { Db } from "@/core/db/types";
import { Forbidden } from "@/core/permissions";
import { fileStore } from "@/core/storage";
import type { Result } from "./custom-fields";
import { namePronunciations, students } from "./schema";

// How a student's name is said: a phonetic spelling and an optional short
// recording. Each save adds a row (the newest is current), so history is kept.
// Audio lives in private storage and is only served after a permission check.

export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"] as const;
export const MAX_AUDIO_BYTES = 512 * 1024;
const EXT: Record<(typeof AUDIO_TYPES)[number], string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav",
};

export const pronunciationInput = z.object({
  studentId: z.uuid(),
  phonetic: z.string().trim().max(80).nullable(),
  /** "keep" reuses the current recording, "remove" drops it, "new" stores `audio`. */
  audio: z.enum(["keep", "remove", "new"]),
});

export interface NewAudio {
  bytes: Buffer;
  contentType: string;
}

/** Strips codec parameters: "audio/webm;codecs=opus" → "audio/webm". */
export function baseAudioType(type: string): (typeof AUDIO_TYPES)[number] | null {
  const base = type.split(";")[0]!.trim().toLowerCase();
  return (AUDIO_TYPES as readonly string[]).includes(base) ? (base as (typeof AUDIO_TYPES)[number]) : null;
}

/**
 * Saves a new pronunciation for a student. Same permission as editing a
 * student's details (teachers: their homeroom).
 */
export async function savePronunciation(
  db: Db,
  viewer: StaffViewer,
  input: z.input<typeof pronunciationInput>,
  newAudio?: NewAudio,
): Promise<Result<{ id: string; phonetic: string | null; hasAudio: boolean }>> {
  const parsed = pronunciationInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That pronunciation isn't valid." };
  let audioType: (typeof AUDIO_TYPES)[number] | null = null;
  if (parsed.data.audio === "new") {
    if (!newAudio || newAudio.bytes.length === 0) return { ok: false, error: "Record the name first." };
    if (newAudio.bytes.length > MAX_AUDIO_BYTES) return { ok: false, error: "That recording is too long. Keep it under 10 seconds." };
    audioType = baseAudioType(newAudio.contentType);
    if (!audioType) return { ok: false, error: "That recording format isn't supported." };
  }
  try {
    return await runStaffAction(
      db, viewer,
      { permission: "students.edit_identity", input: pronunciationInput, target: (i) => ({ studentId: i.studentId }) },
      async ({ tx, input: i, audit }) => {
        const [student] = await tx.select({ id: students.id }).from(students)
          .where(and(eq(students.id, i.studentId), eq(students.schoolId, viewer.schoolId)));
        if (!student) throw new Refused("That student wasn't found.");
        const [current] = await tx.select().from(namePronunciations)
          .where(eq(namePronunciations.studentId, i.studentId)).orderBy(desc(namePronunciations.createdAt)).limit(1);

        let audioObjectKey: string | null = null;
        if (i.audio === "keep") audioObjectKey = current?.audioObjectKey ?? null;
        if (i.audio === "new") {
          audioObjectKey = `pronunciations/${i.studentId}/${randomUUID()}.${EXT[audioType!]}`;
          // Stored before the row commits. If the transaction then fails, the
          // object is orphaned but unreachable: nothing points to it.
          await (await fileStore()).put(audioObjectKey, newAudio!.bytes, audioType!);
        }
        const phonetic = i.phonetic || null;
        if (!phonetic && !audioObjectKey) throw new Refused("Add a phonetic spelling or a recording.");

        const [row] = await tx.insert(namePronunciations).values({
          schoolId: viewer.schoolId, createdBy: viewer.userId, studentId: i.studentId, phonetic, audioObjectKey, recordedByKind: "staff",
        }).returning({ id: namePronunciations.id });
        await audit({
          action: "student.set_pronunciation", entity: "students", entityId: i.studentId,
          before: { phonetic: current?.phonetic ?? null, audio: Boolean(current?.audioObjectKey) },
          after: { phonetic, audio: Boolean(audioObjectKey) },
        });
        return { ok: true as const, data: { id: row!.id, phonetic, hasAudio: Boolean(audioObjectKey) } };
      },
      parsed.data,
    );
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: "You can't change this student's pronunciation." };
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}

/** The recording for a pronunciation row, if it's in the viewer's school. Callers check students.view first. */
export async function pronunciationAudio(db: Db, schoolId: string, pronunciationId: string) {
  const [row] = await db.select({ key: namePronunciations.audioObjectKey }).from(namePronunciations)
    .where(and(eq(namePronunciations.id, pronunciationId), eq(namePronunciations.schoolId, schoolId)));
  if (!row?.key) return null;
  return (await fileStore()).get(row.key);
}
