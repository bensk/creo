"use client";

import { useRef, useState, useTransition } from "react";
import { applyCleverAction, previewCleverAction, type CleverActionResult } from "../clever/actions";
import type { CleverResult } from "../clever/import";

const ROWS: [keyof CleverResult["counts"], string][] = [
  ["students", "Students in the files"],
  ["studentsCreated", "New students"],
  ["studentsUpdated", "Students with changed names, OSIS, or birth dates"],
  ["enrollmentChanges", "Grade or enrollment changes"],
  ["contactChanges", "Contact changes"],
  ["supportChanges", "IEP or ELL changes"],
  ["demographicsChanges", "Demographics changes"],
  ["sections", "Classes in the files"],
  ["sectionsCreated", "New classes"],
  ["sectionsUpdated", "Changed classes"],
  ["sectionsArchived", "Classes no longer in Clever (archived)"],
  ["sectionTeacherChanges", "Teacher changes"],
  ["sectionStudentsAdded", "Students added to classes"],
  ["sectionStudentsEnded", "Students leaving classes"],
  ["homeroomChanges", "Homeroom or grade team changes"],
  ["homeroomTeacherChanges", "Homeroom teacher changes"],
];

export function CleverUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<CleverResult | null>(null);
  const [done, setDone] = useState<CleverResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (action: (form: FormData) => Promise<CleverActionResult>, after: (r: CleverResult) => void) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    start(async () => {
      const res = await action(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      after(res.result);
    });
  };

  const shown = done ?? preview;
  return (
    <section aria-labelledby="clever-h" className="grid gap-4 rounded-lg border border-line-soft p-4">
      <h2 id="clever-h" className="text-lg font-semibold">Clever roster files</h2>
      <label className="grid gap-1 text-sm">
        <span className="voice text-xs text-ink-muted">schools, students, teachers, staff, sections, enrollments (.csv)</span>
        <input
          ref={input}
          type="file"
          multiple
          accept=".csv,text/csv"
          aria-label="Clever files to upload"
          onChange={(e) => {
            setFiles([...(e.target.files ?? [])]);
            setPreview(null);
            setDone(null);
            setError(null);
          }}
          className="text-sm"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || files.length === 0}
          onClick={() => send(previewCleverAction, (r) => { setPreview(r); setDone(null); })}
          className="h-9 rounded-md border border-line px-3 text-sm disabled:opacity-50"
        >
          {pending && !preview ? "Checking…" : "Preview changes"}
        </button>
        {preview && !done && (
          <button
            type="button"
            disabled={pending}
            onClick={() => send(applyCleverAction, (r) => { setDone(r); setPreview(null); if (input.current) input.current.value = ""; setFiles([]); })}
            className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-50"
          >
            {pending ? "Importing…" : "Import these changes"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      {shown && (
        <div className="grid gap-3" role="status">
          <p className="font-medium text-ink-title">{done ? "Imported." : "Nothing is saved yet. This is what importing would change:"}</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            {ROWS.filter(([k]) => shown.counts[k] > 0 || k === "students" || k === "sections").map(([k, label]) => (
              <div key={k} className="contents">
                <dt>{label}</dt>
                <dd className="data text-right">{shown.counts[k]}</dd>
              </div>
            ))}
          </dl>
          {shown.missingFromClever > 0 && (
            <p className="text-sm">
              {shown.missingFromClever} enrolled {shown.missingFromClever === 1 ? "student isn't" : "students aren't"} in these files. Nothing changes for them; withdraw them in the SIS if they&apos;ve left.
            </p>
          )}
          {shown.homerooms.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">Classes read as homerooms ({shown.homerooms.length})</summary>
              <ul className="mt-2 grid gap-1">
                {shown.homerooms.map((h) => (
                  <li key={h.section}>{h.section} <span className="voice text-xs text-ink-muted">→ {h.homeroom}</span></li>
                ))}
              </ul>
            </details>
          )}
          {shown.unmatchedTeachers.length > 0 && (
            <p className="text-sm">
              {shown.unmatchedTeachers.length} Clever {shown.unmatchedTeachers.length === 1 ? "teacher has" : "teachers have"} no matching staff email in the SIS, so their classes have no teacher yet. Check that their creoprep.org address matches.
            </p>
          )}
          {shown.counts.droppedStaffEmails > 0 && (
            <p className="text-sm">{shown.counts.droppedStaffEmails} contact emails were creoprep.org addresses and weren&apos;t saved. Families sign in with a personal email.</p>
          )}
          {shown.problems.length > 0 && (
            <details className="text-sm" open={!done}>
              <summary className="cursor-pointer">Rows skipped ({shown.problems.length})</summary>
              <ul className="data mt-2 grid gap-1 text-xs">
                {shown.problems.slice(0, 200).map((p) => <li key={p}>{p}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
