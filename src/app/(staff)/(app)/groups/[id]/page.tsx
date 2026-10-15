import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { pronunciationAudioUrl, StudentName } from "@/core/ui/StudentName";
import { activeStaff, getGroup, groupMembers, groupStaffMembers, IMPORT_MANAGED_GROUP_TYPES } from "@/modules/cohorts/queries";
import { GroupManager, RemoveStudentButton } from "@/modules/cohorts/ui/GroupManager";
import { rosterFor } from "@/modules/students/queries";

export const metadata = { title: "Group" };

const TYPE: Record<string, string> = { homeroom: "homeroom", grade_team: "grade team", advisory: "advisory", intervention: "intervention", club: "club", team: "team", custom: "group" };
const FN: Record<string, string> = { homeroom_teacher: "homeroom teacher", lead: "lead", member: "member" };
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmt = (d: string) => date.format(new Date(`${d}T00:00:00Z`));

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("staff");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  if (!(await can(db, viewer, "cohorts.view"))) notFound();
  const group = await getGroup(db, viewer.schoolId, id);
  if (!group) notFound();

  const [memberships, staffRows, canManage] = await Promise.all([
    groupMembers(db, group.id, { includePast: true }),
    groupStaffMembers(db, group.id),
    can(db, viewer, "cohorts.manage"),
  ]);
  const roster = new Map((await rosterFor(db, viewer.schoolId, [...new Set(memberships.map((m) => m.studentId))])).map((r) => [r.id, r]));
  const current = memberships.filter((m) => m.current).sort((a, b) =>
    `${roster.get(a.studentId)?.legalLastName} ${roster.get(a.studentId)?.legalFirstName}`.localeCompare(`${roster.get(b.studentId)?.legalLastName} ${roster.get(b.studentId)?.legalFirstName}`));
  const past = memberships.filter((m) => !m.current && !current.some((c) => c.studentId === m.studentId));
  const importManaged = (IMPORT_MANAGED_GROUP_TYPES as readonly string[]).includes(group.type);
  const staffOptions = canManage ? await activeStaff(db, viewer.schoolId) : [];

  return (
    <article className="grid max-w-4xl gap-8">
      <header className="grid gap-1 border-b border-line-soft pb-5">
        <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
        <p className="voice text-sm text-ink-muted">
          {[TYPE[group.type] ?? group.type, group.gradeLevel ? `grade ${group.gradeLevel}` : null, `${current.length} students`, group.archivedAt ? "archived" : null].filter(Boolean).join(" · ")}
        </p>
        <p className="flex flex-wrap gap-4 text-sm">
          <Link href={`/students?group=${group.id}`} className="text-link hover:underline">Open in the student grid</Link>
          <Link href={`/trackers/new?group=${group.id}`} className="text-link hover:underline">Track these students</Link>
        </p>
        {importManaged && <p className="voice text-xs text-ink-muted">students come from the imports. staff can be changed here.</p>}
      </header>

      <GroupManager
        group={{ id: group.id, name: group.name, archived: Boolean(group.archivedAt), importManaged }}
        canManage={canManage}
        staff={staffRows.map((s) => ({ id: s.id, name: s.name, fn: FN[s.function] ?? s.function }))}
        staffOptions={staffOptions}
        members={current.map((m) => m.studentId)}
      />

      <section aria-labelledby="students-h" className="grid gap-2">
        <h2 id="students-h" className="text-lg font-semibold">Students</h2>
        {current.length === 0 ? (
          <p className="voice text-sm text-ink-muted">no students yet.</p>
        ) : (
          <ul className="grid overflow-hidden rounded-lg border border-line-soft">
            {current.map((m) => {
              const s = roster.get(m.studentId);
              if (!s) return null;
              return (
                <li key={m.membershipId} className="flex items-center gap-3 border-b border-line-soft px-4 py-2 last:border-b-0" data-student-id={s.id}>
                  <Link href={`/students/${s.id}`} className="font-medium text-ink-title hover:underline">
                    <StudentName student={s} phonetic={s.phonetic} audioUrl={s.audioId ? pronunciationAudioUrl(s.audioId) : null} />
                  </Link>
                  <span className="voice text-xs text-ink-muted">{[s.grade ? `grade ${s.grade}` : null, `since ${fmt(m.startsOn).toLowerCase()}`].filter(Boolean).join(" · ")}</span>
                  {canManage && !importManaged && <RemoveStudentButton groupId={group.id} studentId={s.id} />}
                </li>
              );
            })}
          </ul>
        )}
        {past.length > 0 && (
          <details className="text-sm">
            <summary className="voice cursor-pointer text-ink-muted">earlier members ({past.length})</summary>
            <ul className="mt-2 grid gap-1">
              {past.map((m) => {
                const s = roster.get(m.studentId);
                return s ? (
                  <li key={m.membershipId} className="flex gap-2">
                    <Link href={`/students/${s.id}`} className="hover:underline"><StudentName student={s} /></Link>
                    <span className="data text-xs text-ink-muted">{fmt(m.startsOn)} – {m.endsOn ? fmt(m.endsOn) : ""}</span>
                  </li>
                ) : null;
              })}
            </ul>
          </details>
        )}
      </section>
    </article>
  );
}
