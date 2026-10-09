import { notFound } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { readForViewer } from "@/core/permissions/read";
import { StudentName } from "@/core/ui/StudentName";
import { membershipsForStudent } from "@/modules/cohorts/queries";
import { contactsForStudent, enrollmentHistory, getStudent } from "@/modules/students/queries";

export const metadata = { title: "Student" };

const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmt = (d: string | null) => (d ? date.format(new Date(`${d}T00:00:00Z`)) : null);
const GROUP_KIND: Record<string, string> = {
  homeroom: "homeroom", grade_team: "grade team", advisory: "advisory", intervention: "intervention",
  club: "club", team: "team", custom: "group",
};

export default async function StudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("staff");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  if (!(await can(db, viewer, "students.view"))) notFound();

  const row = await getStudent(db, viewer.schoolId, id);
  if (!row) notFound();
  // Drops fields above the viewer's sensitivity and logs any restricted fields shown.
  const student = await readForViewer(db, viewer, "students", row.id, row);
  const [memberships, enrollments, contacts] = await Promise.all([
    membershipsForStudent(db, row.id),
    enrollmentHistory(db, row.id),
    contactsForStudent(db, row.id),
  ]);

  const current = enrollments.find((e) => e.status === "active" && !e.exitDate);
  const homeroom = memberships.find((m) => m.current && m.type === "homeroom");
  const currentGroups = memberships.filter((m) => m.current);
  const pastGroups = memberships.filter((m) => !m.current);
  const currentContacts = contacts.filter((c) => c.current);

  return (
    <article className="grid max-w-5xl gap-10">
      <header className="grid gap-2 border-b border-line-soft pb-6">
        <h1 className="text-4xl font-bold tracking-tight">
          <StudentName student={row} />
        </h1>
        <p className="voice text-sm text-ink-muted">
          {[
            row.pronouns,
            current ? `grade ${current.gradeLevel}` : "not enrolled",
            homeroom?.name.toLowerCase(),
            current ? `enrolled since ${fmt(current.entryDate)?.toLowerCase()}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {!current && (
          <p className="w-fit rounded-md border-2 border-amber bg-surface-raised px-3 py-1 text-sm">
            Not currently enrolled
          </p>
        )}
      </header>

      <div className="grid gap-10 md:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-10">
          <section aria-labelledby="contacts-h" className="grid gap-3">
            <h2 id="contacts-h" className="text-lg font-semibold">Family contacts</h2>
            {currentContacts.length === 0 ? (
              <p className="voice text-sm text-ink-muted">no contacts on file.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {currentContacts.map((c) => (
                  <li key={c.id} className="grid gap-1 rounded-lg border border-line-soft p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-ink-title">{c.firstName} {c.lastName}</span>
                      <span className="voice text-xs text-ink-muted">{c.relationship}</span>
                    </div>
                    {c.phonePrimary && (
                      <a className="data text-sm text-link underline-offset-2 hover:underline" href={`tel:${c.phonePrimary.replace(/[^0-9+]/g, "")}`}>
                        {c.phonePrimary}
                      </a>
                    )}
                    {c.phoneSecondary && <span className="data text-sm">{c.phoneSecondary}</span>}
                    {c.email && <span className="break-all text-sm">{c.email}</span>}
                    <span className="voice text-xs text-ink-muted">
                      {[
                        c.language === "es" ? "spanish" : c.language === "en" ? "english" : c.language,
                        c.preferredChannel && `prefers ${c.preferredChannel.replace("_", " ")}`,
                        c.isGuardian && "guardian",
                        c.livesWith && "lives with student",
                        c.pickupAllowed && "can pick up",
                        c.portalAccess && "portal access",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="enrollment-h" className="grid gap-3">
            <h2 id="enrollment-h" className="text-lg font-semibold">Enrollment</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-ink-muted">
                <tr>
                  <th className="voice py-1 font-normal">grade</th>
                  <th className="voice py-1 font-normal">from</th>
                  <th className="voice py-1 font-normal">to</th>
                  <th className="voice py-1 font-normal">status</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => (
                  <tr key={e.id} className="border-t border-line-soft">
                    <td className="data py-2">{e.gradeLevel}</td>
                    <td className="data py-2">{fmt(e.entryDate)}</td>
                    <td className="data py-2">{fmt(e.exitDate) ?? "—"}</td>
                    <td className="py-2">{e.status === "active" ? "Enrolled" : e.status === "withdrawn" ? "Withdrawn" : "Completed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="grid content-start gap-10">
          <section aria-labelledby="groups-h" className="grid gap-3">
            <h2 id="groups-h" className="text-lg font-semibold">Groups</h2>
            <ul className="grid gap-2">
              {currentGroups.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-ink-title">{m.name}</span>
                  <span className="voice text-xs text-ink-muted">{GROUP_KIND[m.type] ?? m.type}</span>
                </li>
              ))}
            </ul>
            {pastGroups.length > 0 && (
              <details className="text-sm">
                <summary className="voice cursor-pointer text-ink-muted">earlier groups ({pastGroups.length})</summary>
                <ul className="mt-2 grid gap-1">
                  {pastGroups.map((m) => (
                    <li key={m.id} className="flex items-baseline justify-between gap-2">
                      <span>{m.name}</span>
                      <span className="data text-xs text-ink-muted">
                        {fmt(m.startsOn)} – {fmt(m.endsOn)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {(student.osis !== undefined || student.dateOfBirth !== undefined) && (
            <section aria-labelledby="ids-h" className="grid gap-2">
              <h2 id="ids-h" className="text-lg font-semibold">Identifiers</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {student.osis !== undefined && (
                  <>
                    <dt className="voice text-ink-muted">osis</dt>
                    <dd className="data">{student.osis ?? "—"}</dd>
                  </>
                )}
                {student.dateOfBirth !== undefined && (
                  <>
                    <dt className="voice text-ink-muted">born</dt>
                    <dd className="data">{fmt(student.dateOfBirth) ?? "—"}</dd>
                  </>
                )}
              </dl>
              <p className="voice text-xs text-ink-muted">restricted. viewing these is logged.</p>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
