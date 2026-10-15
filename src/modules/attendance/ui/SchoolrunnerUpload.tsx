"use client";

import { useRef, useState, useTransition } from "react";
import { importSrAttendanceAction, previewSrAttendanceAction, type SrActionResult } from "../schoolrunner-actions";

type Ok = Extract<SrActionResult, { ok: true }>;
const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Schoolrunner's Daily Attendance exports: fill in days the SIS doesn't have, and compare the days it does. */
export function SchoolrunnerUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Ok | null>(null);
  const [done, setDone] = useState<Ok | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (action: (f: FormData) => Promise<SrActionResult>, after: (r: Ok) => void) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    start(async () => {
      const r = await action(form);
      if (!r.ok) return setError(r.error);
      setError(null);
      after(r);
    });
  };
  const shown = done ?? preview;

  return (
    <section aria-labelledby="sr-h" className="grid gap-4 rounded-lg border border-line-soft p-4">
      <h2 id="sr-h" className="text-lg font-semibold">Schoolrunner daily attendance</h2>
      <p className="text-sm">The Daily Attendance export, one file per day (choose several at once). Days the SIS has no mark for are filled in. Marks staff entered in the SIS are never changed: where Schoolrunner disagrees, you&apos;ll see it below. Contact columns are ignored.</p>
      <input ref={input} type="file" multiple accept=".csv,text/csv" aria-label="Daily Attendance exports" className="text-sm"
        onChange={(e) => { setFiles([...(e.target.files ?? [])]); setPreview(null); setDone(null); setError(null); }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || !files.length} onClick={() => send(previewSrAttendanceAction, (r) => { setPreview(r); setDone(null); })}
          className="h-9 rounded-md border border-line px-3 text-sm disabled:opacity-50">{pending && !preview ? "Checking…" : "Preview"}</button>
        {preview && !done && (
          <button type="button" disabled={pending} onClick={() => send(importSrAttendanceAction, (r) => { setDone(r); setPreview(null); setFiles([]); if (input.current) input.current.value = ""; })}
            className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-50">{pending ? "Importing…" : "Import"}</button>
        )}
      </div>
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      {shown && (
        <div className="grid gap-3" role="status">
          <p className="font-medium text-ink-title">{done ? "Imported." : "Nothing is saved yet. This is what importing would do:"}</p>
          <table className="w-full text-sm">
            <thead className="text-left text-ink-muted"><tr>
              <th className="voice py-1 font-normal">day</th><th className="voice py-1 text-right font-normal">rows</th><th className="voice py-1 text-right font-normal">filled in</th>
              <th className="voice py-1 text-right font-normal">updated</th><th className="voice py-1 text-right font-normal">agree</th><th className="voice py-1 text-right font-normal">differ</th>
              <th className="voice py-1 text-right font-normal">not in schoolrunner</th></tr></thead>
            <tbody>
              {shown.days.map((d) => (
                <tr key={d.date} className="border-t border-line-soft">
                  <td className="data py-2">{fmt.format(new Date(`${d.date}T00:00:00Z`))}</td>
                  {[d.rows, d.imported, d.updated, d.agreed, d.differences, d.missingFromSchoolrunner].map((n, i) => (
                    <td key={i} className={`data py-2 text-right ${i === 4 && n > 0 ? "font-semibold text-ink-title" : ""}`}>{n}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.differences.length > 0 && (
            <details open className="text-sm">
              <summary className="cursor-pointer font-medium">Differences to look into ({shown.differences.length})</summary>
              <ul className="mt-2 grid gap-1">
                {shown.differences.map((d) => (
                  <li key={`${d.studentId}-${d.date}`} className="flex gap-3">
                    <span className="data w-24 text-ink-muted">{fmt.format(new Date(`${d.date}T00:00:00Z`))}</span>
                    <span className="font-medium text-ink-title">{d.name}</span>
                    <span>Schoolrunner <span className="data">{d.schoolrunner}</span>, SIS <span className="data">{d.sis}</span></span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {shown.missing.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">Enrolled in the SIS but not in the export ({shown.days.reduce((n, d) => n + d.missingFromSchoolrunner, 0)})</summary>
              <ul className="mt-2 grid gap-1">{shown.missing.map((m) => <li key={`${m.name}-${m.date}`}>{m.name} <span className="data text-xs text-ink-muted">{m.date}</span></li>)}</ul>
            </details>
          )}
          {shown.problems.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer">Rows skipped ({shown.problems.length})</summary>
              <ul className="data mt-2 grid gap-1 text-xs">{shown.problems.slice(0, 200).map((p) => <li key={p}>{p}</li>)}</ul></details>
          )}
        </div>
      )}
    </section>
  );
}
