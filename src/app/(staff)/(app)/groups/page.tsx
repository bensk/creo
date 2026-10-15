import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { listGroups, listSections } from "@/modules/cohorts/queries";
import { NewGroupForm } from "@/modules/cohorts/ui/NewGroupForm";

export const metadata = { title: "Groups" };

const TYPE_LABEL: Record<string, string> = {
  homeroom: "Homerooms", grade_team: "Grade teams", advisory: "Advisories", intervention: "Interventions", club: "Clubs", team: "Teams", custom: "Other groups",
};

export default async function GroupsPage() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await can(db, viewer, "cohorts.view"))) notFound();
  const [groups, classes, canManage] = await Promise.all([
    listGroups(db, viewer.schoolId),
    listSections(db, viewer.schoolId),
    can(db, viewer, "cohorts.manage"),
  ]);
  const byType = Object.groupBy(groups.filter((g) => !g.archivedAt), (g) => g.type);
  const archived = groups.filter((g) => g.archivedAt);

  return (
    <div className="grid max-w-5xl gap-10">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
        <p className="max-w-2xl">Homerooms and grade teams come from the imports. Interventions, advisories, clubs, and other groups are made here.</p>
      </header>

      {canManage && <NewGroupForm />}

      {Object.entries(TYPE_LABEL).map(([type, label]) => {
        const list = byType[type];
        if (!list?.length) return null;
        return (
          <section key={type} aria-labelledby={`${type}-h`} className="grid gap-2">
            <h2 id={`${type}-h`} className="text-lg font-semibold">{label}</h2>
            <ul className="grid overflow-hidden rounded-lg border border-line-soft sm:grid-cols-2">
              {list.map((g) => (
                <li key={g.id} className="border-b border-line-soft sm:odd:border-r">
                  <Link href={`/groups/${g.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised focus-visible:bg-surface-raised">
                    <span className="grid">
                      <span className="font-semibold text-ink-title">{g.name}</span>
                      <span className="voice text-xs text-ink-muted">
                        {[g.gradeLevel ? `grade ${g.gradeLevel}` : null, g.staffNames.length ? g.staffNames.join(", ") : "no staff yet"].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="data ml-auto text-ink-title">{g.students}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section aria-labelledby="classes-h" className="grid gap-2">
        <h2 id="classes-h" className="text-lg font-semibold">Classes</h2>
        {classes.length === 0 ? (
          <p className="voice text-sm text-ink-muted">no classes yet. they arrive with the clever import.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-ink-muted">
              <tr>
                <th className="voice py-1 font-normal">class</th>
                <th className="voice py-1 font-normal">grade</th>
                <th className="voice py-1 font-normal">period</th>
                <th className="voice py-1 font-normal">teachers</th>
                <th className="voice py-1 text-right font-normal">students</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id} className="border-t border-line-soft">
                  <td className="py-2"><Link href={`/sections/${c.id}`} className="text-link hover:underline">{c.name}</Link></td>
                  <td className="data py-2">{c.gradeLevel ?? "—"}</td>
                  <td className="data py-2">{c.period ?? "—"}</td>
                  <td className="py-2">{c.teacherNames.join(", ") || "—"}</td>
                  <td className="data py-2 text-right">{c.students}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="voice cursor-pointer text-ink-muted">archived groups ({archived.length})</summary>
          <ul className="mt-2 grid gap-1">
            {archived.map((g) => <li key={g.id}><Link href={`/groups/${g.id}`} className="text-link hover:underline">{g.name}</Link></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
