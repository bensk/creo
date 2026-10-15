import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { recentImportRuns } from "@/modules/integrations/queries";
import { SchoolrunnerUpload } from "@/modules/attendance/ui/SchoolrunnerUpload";
import { CleverUpload } from "@/modules/integrations/ui/CleverUpload";

export const metadata = { title: "Imports" };

const SOURCE: Record<string, string> = { clever: "Clever", big_data_tracker: "Big Data Tracker", schoolrunner: "Schoolrunner" };
const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default async function ImportsPage() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await can(db, viewer, "integrations.run_imports"))) notFound();
  const runs = await recentImportRuns(db, viewer.schoolId);
  return (
    <div className="grid max-w-4xl gap-10">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Imports</h1>
        <p className="max-w-2xl">
          Upload the six roster files Schoolrunner sends to Clever. You&apos;ll see what will change before anything is saved. Clever&apos;s files win over the Big Data Tracker for names, grades, homerooms, classes, contacts, and IEP and ELL status.
        </p>
      </header>
      <CleverUpload />
      <SchoolrunnerUpload />
      <section aria-labelledby="runs-h" className="grid gap-3">
        <h2 id="runs-h" className="text-lg font-semibold">Recent imports</h2>
        {runs.length === 0 ? (
          <p className="voice text-sm text-ink-muted">no imports yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-ink-muted">
              <tr>
                <th className="voice py-1 font-normal">source</th>
                <th className="voice py-1 font-normal">started</th>
                <th className="voice py-1 font-normal">result</th>
                <th className="voice py-1 font-normal">students</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const c = (r.counts ?? {}) as Record<string, number>;
                return (
                  <tr key={r.id} className="border-t border-line-soft">
                    <td className="py-2">{SOURCE[r.source] ?? r.source}</td>
                    <td className="data py-2">{when.format(r.startedAt)}</td>
                    <td className="py-2">{r.status === "succeeded" ? "Done" : r.status === "failed" ? "Failed, nothing changed" : "Running"}</td>
                    <td className="data py-2">{c.students ?? c.rows ?? (Array.isArray(c.days) ? `${(c.days as unknown[]).length} days` : "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
