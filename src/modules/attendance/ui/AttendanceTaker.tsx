"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";
import { StudentName, type StudentNameParts } from "@/core/ui/StudentName";
import { markAttendanceAction } from "../actions";

interface Code { id: string; code: string; label: string; countsAs: string }
interface Student { id: string; name: StudentNameParts; phonetic: string | null; audioUrl: string | null; codeId: string | null }

const TONE: Record<string, string> = {
  present: "border-line", tardy: "border-amber", absent: "border-crimson", excused: "border-line",
};

/**
 * One homeroom, one day. p / a / t / e mark the selected student and move to
 * the next unmarked one; j / k move; space says the name; shift+p marks
 * everyone not yet marked present. Every mark saves on its own.
 */
export function AttendanceTaker({ groupId, date, codes: allCodes, students, manage = false }: {
  groupId: string; date: string; codes: Code[]; students: Student[];
  /** Ops, admins, and leaders also get the office codes (ET, ISS, OSS) from a menu. */
  manage?: boolean;
}) {
  // Homeroom codes are the one-letter ones (P / T / A / E), each with its key.
  const codes = allCodes.filter((c) => c.code.length === 1);
  const officeCodes = allCodes.filter((c) => c.code.length > 1);
  const [marks, setMarks] = useState<Map<string, string | null>>(() => new Map(students.map((s) => [s.id, s.codeId])));
  const firstOpen = Math.max(0, students.findIndex((s) => !s.codeId));
  const [selected, setSelected] = useState(firstOpen);
  const [error, setError] = useState<string | null>(null);
  // Marks show at once and save in the background; count saves still in flight.
  const [saving, setSaving] = useState(0);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const codeById = useMemo(() => new Map(allCodes.map((c) => [c.id, c])), [allCodes]);
  const present = codes.find((c) => c.countsAs === "present");
  const keyFor = (c: Code) => c.code.charAt(0).toLowerCase();
  const marked = [...marks.values()].filter(Boolean).length;

  useEffect(() => {
    rows.current[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // Leaving while a mark is still saving would lose it: ask first.
  useEffect(() => {
    if (!saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  const save = async (list: { studentId: string; codeId: string }[]) => {
    const before = new Map(marks);
    setMarks((m) => {
      const next = new Map(m);
      for (const x of list) next.set(x.studentId, x.codeId);
      return next;
    });
    setSaving((n) => n + 1);
    const res = await markAttendanceAction(groupId, date, list).finally(() => setSaving((n) => n - 1));
    if (!res.ok) {
      setError(res.error);
      setMarks((m) => {
        const next = new Map(m);
        for (const x of list) next.set(x.studentId, before.get(x.studentId) ?? null);
        return next;
      });
    } else setError(null);
  };

  const mark = (index: number, code: Code) => {
    const s = students[index];
    if (!s) return;
    void save([{ studentId: s.id, codeId: code.id }]);
    // Next student without a mark after this one, else just the next row.
    const after = students.findIndex((x, i) => i > index && !marks.get(x.id));
    setSelected(after >= 0 ? after : Math.min(students.length - 1, index + 1));
  };

  useShortcut({ keys: "j", description: "Next student", group: "This screen", run: () => setSelected((i) => Math.min(students.length - 1, i + 1)) });
  useShortcut({ keys: "k", description: "Previous student", group: "This screen", run: () => setSelected((i) => Math.max(0, i - 1)) });
  useShortcut({ keys: "space", description: "Say the selected student's name", group: "This screen",
    run: () => rows.current[selected]?.querySelector<HTMLButtonElement>("[data-play-name]")?.click() });
  useShortcut({ keys: "shift+p", description: "Mark everyone not yet marked present", group: "This screen",
    run: () => { if (present) void save(students.filter((s) => !marks.get(s.id)).map((s) => ({ studentId: s.id, codeId: present.id }))); } });
  // One shortcut per code, from its first letter (p, a, t, e for the usual codes).
  const k0 = codes[0], k1 = codes[1], k2 = codes[2], k3 = codes[3], k4 = codes[4], k5 = codes[5];
  useShortcut({ keys: k0 ? keyFor(k0) : "f13", description: k0 ? `Mark ${k0.label.toLowerCase()}` : "", group: "This screen", run: () => k0 && mark(selected, k0) }, Boolean(k0));
  useShortcut({ keys: k1 ? keyFor(k1) : "f14", description: k1 ? `Mark ${k1.label.toLowerCase()}` : "", group: "This screen", run: () => k1 && mark(selected, k1) }, Boolean(k1));
  useShortcut({ keys: k2 ? keyFor(k2) : "f15", description: k2 ? `Mark ${k2.label.toLowerCase()}` : "", group: "This screen", run: () => k2 && mark(selected, k2) }, Boolean(k2));
  useShortcut({ keys: k3 ? keyFor(k3) : "f16", description: k3 ? `Mark ${k3.label.toLowerCase()}` : "", group: "This screen", run: () => k3 && mark(selected, k3) }, Boolean(k3));
  useShortcut({ keys: k4 ? keyFor(k4) : "f17", description: k4 ? `Mark ${k4.label.toLowerCase()}` : "", group: "This screen", run: () => k4 && mark(selected, k4) }, Boolean(k4));
  useShortcut({ keys: k5 ? keyFor(k5) : "f18", description: k5 ? `Mark ${k5.label.toLowerCase()}` : "", group: "This screen", run: () => k5 && mark(selected, k5) }, Boolean(k5));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="data text-ink-title" aria-live="polite">{marked} of {students.length} marked</span>
        {marked === students.length && students.length > 0 && <span role="status" className="font-semibold text-ink-title">Done. Thank you.</span>}
        <span className="voice text-xs text-ink-muted" aria-live="polite">{saving ? "saving…" : marked ? "all saved" : ""}</span>
        <span className="voice ml-auto text-xs text-ink-muted">
          {codes.map((c) => `${keyFor(c)} ${c.label.toLowerCase()}`).join(" · ")} · shift+p rest present · space says the name
        </span>
      </div>
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      <ul className="grid overflow-hidden rounded-lg border border-line-soft" aria-label="Students">
        {students.map((s, i) => {
          const current = marks.get(s.id);
          const code = current ? codeById.get(current) : null;
          return (
            <li
              key={s.id}
              ref={(el) => { rows.current[i] = el; }}
              aria-current={i === selected ? "true" : undefined}
              onClick={() => setSelected(i)}
              className="flex flex-wrap items-center gap-3 border-b border-line-soft px-3 py-2 last:border-b-0 aria-[current=true]:bg-surface-raised aria-[current=true]:shadow-[inset_3px_0_0_var(--brand-amber)]"
            >
              <span className="min-w-48 flex-1 text-base font-medium text-ink-title">
                <StudentName student={s.name} phonetic={s.phonetic} audioUrl={s.audioUrl} />
              </span>
              <span className="flex gap-1" role="group" aria-label={`Attendance for ${s.name.preferredFirstName ?? s.name.legalFirstName}`}>
                {codes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={current === c.id}
                    title={c.label}
                    onClick={(e) => { e.stopPropagation(); setSelected(i); mark(i, c); }}
                    className={`data h-11 min-w-11 rounded-md border-2 px-3 text-sm ${current === c.id ? `${TONE[c.countsAs] ?? "border-line"} bg-ink-title text-surface` : "border-line-soft text-ink-muted hover:border-line"}`}
                  >
                    {c.code}
                  </button>
                ))}
              </span>
              {manage && officeCodes.length > 0 && (
                <select
                  aria-label={`Other codes for ${s.name.preferredFirstName ?? s.name.legalFirstName}`}
                  value={officeCodes.some((c) => c.id === current) ? current! : ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { const c = officeCodes.find((x) => x.id === e.target.value); if (c) { setSelected(i); mark(i, c); } }}
                  className="h-11 rounded-md border-2 border-line-soft bg-surface px-2 text-sm"
                >
                  <option value="">Other</option>
                  {officeCodes.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.label}</option>)}
                </select>
              )}
              <span className="voice w-28 text-right text-xs text-ink-muted">{code ? code.label.toLowerCase() : "not marked"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
