import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import Link from "next/link";
import { groupsForStaff, listSections } from "@/modules/cohorts/queries";
import { GroupList } from "./GroupList";

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function StaffHome() {
  const viewer = await requireViewer("staff");
  const [groups, classes] = await Promise.all([
    groupsForStaff(getDb(), viewer.staffId),
    listSections(getDb(), viewer.schoolId, { staffId: viewer.staffId }),
  ]);
  const firstName = viewer.displayName.split(" ")[0];
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return (
    <div className="grid max-w-3xl gap-10">
      <header className="grid gap-1">
        <p className="voice text-sm text-ink-muted">{today.toLowerCase()}</p>
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting(new Date())}, {firstName}.
        </h1>
      </header>

      <section aria-labelledby="groups-h" className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="groups-h" className="text-lg font-semibold">Your groups</h2>
          {groups.length > 0 && <span className="voice text-xs text-ink-muted">j / k to move · enter to open</span>}
        </div>
        {groups.length > 0 ? (
          <GroupList
            groups={groups.map((g) => ({
              id: g.id,
              name: g.name,
              kind: g.type === "homeroom" ? "homeroom" : g.type === "grade_team" ? "grade team" : g.type,
              role: g.function === "homeroom_teacher" ? "homeroom teacher" : g.function === "lead" ? "lead" : "member",
              students: g.students,
            }))}
          />
        ) : (
          <p className="voice rounded-lg border border-dashed border-line p-6 text-sm text-ink-muted">
            you aren&apos;t assigned to a homeroom or team yet. press ⌘K to find any student.
          </p>
        )}
      </section>

      {classes.length > 0 && (
        <section aria-labelledby="classes-h" className="grid gap-3">
          <h2 id="classes-h" className="text-lg font-semibold">Your classes</h2>
          <ul className="grid overflow-hidden rounded-lg border border-line-soft">
            {classes.map((c) => (
              <li key={c.id} className="border-b border-line-soft last:border-b-0">
                <Link href={`/sections/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-raised focus-visible:bg-surface-raised">
                  <span className="grid">
                    <span className="font-semibold text-ink-title">{c.name}</span>
                    <span className="voice text-xs text-ink-muted">{[c.courseName, c.period ? `period ${c.period}` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="ml-auto text-right">
                    <span className="data text-lg text-ink-title">{c.students}</span>
                    <span className="voice ml-1 text-xs text-ink-muted">students</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
