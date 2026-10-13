import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import type { StaffViewer } from "@/core/auth/viewer";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { assertKey } from "@/core/storage";
import { baseAudioType, MAX_AUDIO_BYTES, pronunciationAudio, savePronunciation } from "./pronunciation";
import { currentPronunciation } from "./queries";
import { namePronunciations } from "./schema";

afterAll(async () => {
  await getSql().end();
});

const LEADER = "marisol.pena@creoprep.org";
const TEACHER = "jordan.reyes@creoprep.org"; // Syracuse homeroom
const as = async (tx: Db, email: string) => (await viewerFor(tx, email)) as StaffViewer;
const clip = (n = 2048) => ({ bytes: Buffer.alloc(n, 7), contentType: "audio/webm;codecs=opus" });

describe("pronunciation", () => {
  it("stores a recording privately and keeps history", async () => {
    await withSeed(async (tx) => {
      const leader = await as(tx, LEADER);
      const studentId = await studentIdByName(tx, "Camila", "Martinez");
      const first = await savePronunciation(tx, leader, { studentId, phonetic: "kah-MEE-lah", audio: "new" }, clip());
      expect(first).toMatchObject({ ok: true, data: { hasAudio: true } });
      const object = await pronunciationAudio(tx, leader.schoolId, first.ok ? first.data.id : "");
      expect(object?.contentType).toBe("audio/webm");
      expect(object?.body.length).toBe(2048);

      // Changing only the spelling keeps the recording; history grows.
      const second = await savePronunciation(tx, leader, { studentId, phonetic: "kah-MEE-lah TOR-res", audio: "keep" });
      expect(second).toMatchObject({ ok: true, data: { hasAudio: true } });
      expect((await currentPronunciation(tx, studentId))?.phonetic).toBe("kah-MEE-lah TOR-res");
      const rows = await tx.select().from(namePronunciations).where(eq(namePronunciations.studentId, studentId));
      expect(rows.length).toBeGreaterThanOrEqual(2);

      const removed = await savePronunciation(tx, leader, { studentId, phonetic: "kah-MEE-lah", audio: "remove" });
      expect(removed).toMatchObject({ ok: true, data: { hasAudio: false } });
    });
  });

  it("refuses empty, oversized, and unsupported recordings", async () => {
    await withSeed(async (tx) => {
      const leader = await as(tx, LEADER);
      const studentId = await studentIdByName(tx, "Camila", "Martinez");
      expect(await savePronunciation(tx, leader, { studentId, phonetic: null, audio: "remove" })).toMatchObject({ ok: false });
      expect(await savePronunciation(tx, leader, { studentId, phonetic: null, audio: "new" }, clip(MAX_AUDIO_BYTES + 1))).toMatchObject({ ok: false });
      expect(await savePronunciation(tx, leader, { studentId, phonetic: null, audio: "new" }, { bytes: Buffer.alloc(10), contentType: "text/html" })).toMatchObject({ ok: false });
    });
  });

  it("lets a teacher edit only their homeroom's students", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const mine = await studentIdByName(tx, "Camila", "Martinez");
      const other = { id: await studentIdByName(tx, "Mateo", "Martinez") }; // not in Syracuse
      expect(await savePronunciation(tx, teacher, { studentId: mine, phonetic: "kah-MEE-lah", audio: "keep" })).toMatchObject({ ok: true });
      expect(await savePronunciation(tx, teacher, { studentId: other.id, phonetic: "x", audio: "keep" })).toMatchObject({ ok: false });
    });
  });

  it("only accepts known audio types and safe keys", () => {
    expect(baseAudioType("audio/mp4")).toBe("audio/mp4");
    expect(baseAudioType("image/svg+xml")).toBeNull();
    expect(() => assertKey("../etc/passwd")).toThrow();
    expect(() => assertKey("pronunciations/a/b.webm")).not.toThrow();
  });
});
