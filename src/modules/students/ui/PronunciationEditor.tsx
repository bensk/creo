"use client";

import { useEffect, useState, useTransition } from "react";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";
import { savePronunciationAction } from "../actions";

const MAX_SECONDS = 10;
const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * Profile control for how a student's name is said: a phonetic spelling and a
 * short recording made in the browser. `p` plays the current recording.
 */
export function PronunciationEditor({
  studentId,
  phonetic,
  audioUrl,
  canEdit,
}: {
  studentId: string;
  phonetic: string | null;
  audioUrl: string | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(phonetic ?? "");
  const [recording, setRecording] = useState<Blob | null>(null);
  const [removeAudio, setRemoveAudio] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);

  useShortcut({
    keys: "p",
    description: "Play how to say this student's name",
    group: "This screen",
    run: () => {
      if (audioUrl) void new Audio(audioUrl).play();
    },
  });

  useEffect(() => {
    if (!recorder) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
    }, 200);
    return () => clearInterval(timer);
  }, [recorder]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType });
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        setRecording(blob);
        setRemoveAudio(false);
        setRecorder(null);
      };
      r.start();
      setSeconds(0);
      setRecorder(r);
    } catch {
      setError("The microphone isn't available. Check the browser's permission for this site.");
    }
  };

  const save = () => {
    const form = new FormData();
    form.set("studentId", studentId);
    form.set("phonetic", text);
    form.set("mode", recording ? "new" : removeAudio ? "remove" : "keep");
    if (recording) form.set("audio", new File([recording], "name", { type: recording.type }));
    startTransition(async () => {
      const result = await savePronunciationAction(form);
      if (!result.ok) return setError(result.error);
      setError(null);
      setRecording(null);
      setOpen(false);
      setNotice("Saved pronunciation.");
    });
  };

  if (!canEdit) return null;
  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => { setOpen(true); setNotice(null); }} className="text-sm text-link hover:underline">
          {phonetic || audioUrl ? "Edit pronunciation" : "Add pronunciation"}
        </button>
        {notice && <span role="status" className="text-xs text-ink-muted">{notice}</span>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save(); }}
      className="grid max-w-xl gap-3 rounded-lg border border-line-soft bg-surface-raised p-4"
      aria-label="Pronunciation"
    >
      <label className="grid gap-1 text-sm">
        <span className="voice text-xs text-ink-muted">phonetic spelling</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={80}
          placeholder="e.g. kah-MEE-lah"
          autoFocus
          className="h-9 rounded-md border border-line bg-surface px-3"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {recorder ? (
          <button type="button" onClick={() => recorder.stop()} className="h-9 rounded-md border-2 border-crimson px-3">
            Stop <span className="data text-xs text-ink-muted">{seconds}s / {MAX_SECONDS}s</span>
          </button>
        ) : (
          <button type="button" onClick={start} className="h-9 rounded-md border border-line px-3">
            {recording || audioUrl ? "Record again" : "Record the name"}
          </button>
        )}
        {recording && preview && <audio controls src={preview} className="h-9" aria-label="New recording" />}
        {!recording && audioUrl && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={removeAudio} onChange={(e) => setRemoveAudio(e.target.checked)} />
            Remove the current recording
          </label>
        )}
      </div>
      <p className="voice text-xs text-ink-muted">up to {MAX_SECONDS} seconds. say the name the way the student says it.</p>
      {error && <p role="alert" className="rounded-md border-2 border-crimson px-3 py-2 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || Boolean(recorder)} className="h-9 rounded-md bg-ink-title px-3 text-sm text-surface disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => { setOpen(false); setRecording(null); setError(null); setText(phonetic ?? ""); }} className="h-9 rounded-md border border-line px-3 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
