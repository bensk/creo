import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { fieldContext } from "@/core/query/run";
import { calendarFor } from "@/modules/attendance/calendar";
import { CalendarEditor } from "@/modules/attendance/ui/CalendarEditor";

export const metadata = { title: "School calendar" };

export default async function CalendarPage() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await can(db, viewer, "attendance.manage"))) notFound();
  const { today } = await fieldContext(db, viewer.schoolId);
  const { year, days } = await calendarFor(db, viewer.schoolId, today);
  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">School calendar</h1>
        <p className="max-w-2xl">
          Every weekday {year ? `from ${year.startsOn} to ${year.endsOn}` : "in the school year"} is a full school day, and weekends are off. Mark the exceptions here: days off, half days, or a school day on a weekend. Attendance rates and the not-taken list follow this calendar.
        </p>
      </header>
      <CalendarEditor today={today} days={days.map((d) => ({ date: d.date, isInstructional: d.isInstructional, dayType: d.dayType as "full" | "half" | "other", note: d.note }))} />
    </div>
  );
}
