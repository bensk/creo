import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { pronunciationAudioUrl, StudentName } from "@/core/ui/StudentName";
import { getSection, sectionMembers, sectionTeachers } from "@/modules/cohorts/queries";
import { rosterFor } from "@/modules/students/queries";

export const metadata = { title: "Class" };

export default async function SectionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("staff");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  if (!(await can(db, viewer, "cohorts.view"))) notFound();
  const section = await getSection(db, viewer.schoolId, id);
  if (!section) notFound();
  const [members, teachers] = await Promise.all([sectionMembers(db, section.id), sectionTeachers(db, section.id)]);
  const roster = (await rosterFor(db, viewer.schoolId, members.map((m) => m.studentId)))
    .sort((a, b) => `${a.legalLastName} ${a.legalFirstName}`.localeCompare(`${b.legalLastName} ${b.legalFirstName}`));

  return (
    <article className="grid max-w-4xl gap-8">
      <header className="grid gap-1 border-b border-line-soft pb-5">
        <h1 className="text-3xl font-bold tracking-tight">{section.name}</h1>
        <p className="voice text-sm text-ink-muted">
          {[section.courseName, section.gradeLevel ? `grade ${section.gradeLevel}` : null, section.period ? `period ${section.period}` : null, section.termName, `${roster.length} students`, section.archivedAt ? "no longer in clever" : null]
            .filter(Boolean).join(" · ")}
        </p>
        <p className="text-sm">{teachers.map((t) => `${t.name}${t.role === "co_teacher" ? " (co-teacher)" : ""}`).join(", ") || "No teacher yet"}</p>
        <p className="text-sm"><Link href={`/students?section=${section.id}`} className="text-link hover:underline">Open in the student grid</Link></p>
        <p className="voice text-xs text-ink-muted">classes come from the clever import.</p>
      </header>
      <section aria-labelledby="students-h" className="grid gap-2">
        <h2 id="students-h" className="text-lg font-semibold">Students</h2>
        {roster.length === 0 ? (
          <p className="voice text-sm text-ink-muted">no students.</p>
        ) : (
          <ul className="grid overflow-hidden rounded-lg border border-line-soft">
            {roster.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-2 last:border-b-0">
                <Link href={`/students/${s.id}`} className="font-medium text-ink-title hover:underline">
                  <StudentName student={s} phonetic={s.phonetic} audioUrl={s.audioId ? pronunciationAudioUrl(s.audioId) : null} />
                </Link>
                <span className="voice text-xs text-ink-muted">{s.grade ? `grade ${s.grade}` : "not enrolled"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
