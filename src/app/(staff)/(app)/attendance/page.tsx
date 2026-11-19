import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { holdsSomewhere } from "@/core/permissions";
import { fieldContext } from "@/core/query/run";
import { pronunciationAudioUrl } from "@/core/ui/StudentName";
import { rosterFor } from "@/modules/students/queries";
import { activeCodes, attendanceProgress, homeroomDay, homeroomsFor } from "@/modules/attendance/take";
import { AttendanceTaker } from "@/modules/attendance/ui/AttendanceTaker";

export const metadata = { title: "Attendance" };

const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ homeroom?: string; date?: string }> }) {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!holdsSomewhere(viewer, "attendance.take")) notFound();
  const params = await searchParams;
  const { today } = await fieldContext(db, viewer.schoolId);
  const { homerooms, manage } = await homeroomsFor(db, viewer);
  const day = manage && params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date <= today ? params.date : today;
  const selected = homerooms.find((h) => h.id === params.homeroom) ?? (manage ? null : homerooms[0]) ?? null;

  if (!selected) {
    if (!manage) {
      return (
        <div className="grid max-w-3xl gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
          <p className="voice text-sm text-ink-muted">you aren&apos;t a homeroom teacher, so there&apos;s no attendance for you to take.</p>
        </div>
      );
    }
    // Ops, admins, and leaders start with who has and hasn't taken attendance.
    const progress = await attendanceProgress(db, viewer.schoolId, day);
    const missing = progress.filter((p) => p.students > 0 && p.marked < p.students);
    return (
      <div className="grid max-w-4xl gap-6">
        <header className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
            <p className="voice text-sm text-ink-muted">{date.format(new Date(`${day}T00:00:00Z`)).toLowerCase()} · {missing.length ? `${missing.length} homerooms not finished` : "every homeroom is done"}</p>
          </div>
          <form className="ml-auto flex items-end gap-2" action="/attendance">
            <label className="grid gap-1 text-sm"><span className="voice text-xs text-ink-muted">day</span>
              <input type="date" name="date" max={today} defaultValue={day} className="h-9 rounded-md border border-line bg-surface px-3 text-sm" /></label>
            <button type="submit" className="h-9 rounded-md border border-line px-3 text-sm">Show</button>
          </form>
        </header>
        <table className="w-full text-sm">
          <thead className="text-left text-ink-muted">
            <tr><th className="voice py-1 font-normal">homeroom</th><th className="voice py-1 font-normal">grade</th><th className="voice py-1 font-normal">teacher</th><th className="voice py-1 text-right font-normal">marked</th></tr>
          </thead>
          <tbody>
            {progress.map((p) => (
              <tr key={p.id} className="border-t border-line-soft">
                <td className="py-2"><Link className="text-link hover:underline" href={`/attendance?homeroom=${p.id}&date=${day}`}>{p.name}</Link></td>
                <td className="data py-2">{p.gradeLevel ?? "—"}</td>
                <td className="py-2">{p.staffNames.join(", ") || "—"}</td>
                <td className={`data py-2 text-right ${p.marked < p.students ? "font-semibold text-ink-title" : "text-ink-muted"}`}>{p.marked} / {p.students}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const [codes, dayData] = await Promise.all([activeCodes(db, viewer.schoolId), homeroomDay(db, viewer.schoolId, selected.id, day)]);
  const roster = (await rosterFor(db, viewer.schoolId, dayData.studentIds))
    .sort((a, b) => `${a.preferredLastName ?? a.legalLastName} ${a.preferredFirstName ?? a.legalFirstName}`.localeCompare(`${b.preferredLastName ?? b.legalLastName} ${b.preferredFirstName ?? b.legalFirstName}`));

  return (
    <div className="grid max-w-3xl gap-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <h1 className="text-3xl font-bold tracking-tight">{selected.name}</h1>
          <p className="voice text-sm text-ink-muted">{date.format(new Date(`${day}T00:00:00Z`)).toLowerCase()}{day !== today ? " · correcting an earlier day" : ""}</p>
        </div>
        {(manage || homerooms.length > 1) && (
          <p className="ml-auto text-sm"><Link className="text-link hover:underline" href={manage ? `/attendance?date=${day}` : "/attendance"}>{manage ? "All homerooms" : "Switch homeroom"}</Link></p>
        )}
      </header>
      <AttendanceTaker
        groupId={selected.id}
        date={day}
        codes={codes.map((c) => ({ id: c.id, code: c.code, label: c.label, countsAs: c.countsAs }))}
        students={roster.map((s) => ({
          id: s.id,
          name: { legalFirstName: s.legalFirstName, legalLastName: s.legalLastName, preferredFirstName: s.preferredFirstName, preferredLastName: s.preferredLastName },
          phonetic: s.phonetic,
          audioUrl: s.audioId ? pronunciationAudioUrl(s.audioId) : null,
          codeId: dayData.marks.get(s.id)?.codeId ?? null,
        }))}
      />
    </div>
  );
}
