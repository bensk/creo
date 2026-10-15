import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { fieldContext } from "@/core/query/run";
import { displayName } from "@/core/ui/StudentName";
import { dayInfo } from "@/modules/attendance/calendar";
import { lateArrivals } from "@/modules/attendance/desk";
import { LateDesk } from "@/modules/attendance/ui/LateDesk";
import { rosterFor } from "@/modules/students/queries";

export const metadata = { title: "Late arrivals" };
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default async function LatePage() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await can(db, viewer, "attendance.manage"))) notFound();
  const { today } = await fieldContext(db, viewer.schoolId);
  const [day, arrivals] = await Promise.all([dayInfo(db, viewer.schoolId, today), lateArrivals(db, viewer.schoolId, today)]);
  const names = new Map((await rosterFor(db, viewer.schoolId, arrivals.map((a) => a.studentId))).map((r) => [r.id, displayName(r)]));
  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Late arrivals</h1>
        <p>Find the student and sign them in. They&apos;re marked tardy for today with the time they arrived, even if homeroom marked them absent.</p>
      </header>
      {day.isSchoolDay ? <LateDesk /> : <p className="voice text-sm text-ink-muted">today isn&apos;t a school day.</p>}
      <section aria-labelledby="today-h" className="grid gap-2">
        <h2 id="today-h" className="text-lg font-semibold">Signed in late today</h2>
        {arrivals.length === 0 ? <p className="voice text-sm text-ink-muted">nobody yet.</p> : (
          <ul className="grid gap-1 text-sm">
            {arrivals.map((a) => (
              <li key={a.studentId} className="flex gap-3"><span className="data w-20 text-ink-muted">{a.arrivedAt ? time.format(a.arrivedAt) : ""}</span><span className="font-medium text-ink-title">{names.get(a.studentId)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
