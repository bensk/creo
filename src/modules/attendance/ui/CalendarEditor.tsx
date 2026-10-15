"use client";

import { useState, useTransition } from "react";
import { clearSchoolDayAction, setSchoolDayAction } from "../actions";

type Day = { date: string; isInstructional: boolean; dayType: "full" | "half" | "other"; note: string | null };
const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const field = "h-9 rounded-md border border-line bg-surface px-3 text-sm";
const KIND: Record<string, string> = { off: "Day off", half: "Half day", other: "School day (other)" };

export function CalendarEditor({ today, days }: { today: string; days: Day[] }) {
  const [draft, setDraft] = useState({ date: today, kind: "off", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (work: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await work();
      setError(r.ok ? null : (r.error ?? "That didn't work."));
    });

  return (
    <div className="grid gap-6">
      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-line-soft p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setSchoolDayAction({
            date: draft.date, isInstructional: draft.kind !== "off", dayType: draft.kind === "half" ? "half" : draft.kind === "other" ? "other" : "other",
            note: draft.note.trim() || null,
          }));
        }}>
        <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">date</span>
          <input type="date" required className={field} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
        <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">kind</span>
          <select className={field} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
            {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">note</span>
          <input className={`${field} w-64`} maxLength={120} placeholder="e.g. Thanksgiving recess" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
        <button type="submit" disabled={pending} className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-60">Mark</button>
      </form>
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      {days.length === 0 ? (
        <p className="voice text-sm text-ink-muted">no days marked yet.</p>
      ) : (
        <ul className="grid overflow-hidden rounded-lg border border-line-soft">
          {days.map((d) => (
            <li key={d.date} className="flex items-center gap-3 border-b border-line-soft px-4 py-2 text-sm last:border-b-0">
              <span className="data w-28 text-ink-title">{fmt.format(new Date(`${d.date}T00:00:00Z`))}</span>
              <span className="font-medium">{!d.isInstructional ? "Day off" : d.dayType === "half" ? "Half day" : "School day"}</span>
              {d.note && <span className="text-ink-muted">{d.note}</span>}
              <button type="button" disabled={pending} className="ml-auto text-link hover:underline" onClick={() => run(() => clearSchoolDayAction(d.date))}>
                Remove<span className="sr-only"> {d.date}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
