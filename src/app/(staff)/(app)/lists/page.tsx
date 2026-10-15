import Link from "next/link";
import { inArray } from "drizzle-orm";
import { requireViewer } from "@/core/auth/server";
import { staff } from "@/core/auth/schema";
import { getDb } from "@/core/db/client";
import { listsForViewer } from "@/modules/cohorts/lists";
import { NewListForm } from "@/modules/cohorts/ui/NewListForm";

export const metadata = { title: "Lists" };

export default async function ListsPage() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  const lists = await listsForViewer(db, viewer);
  const owners = new Map(
    lists.length
      ? (await db.select({ id: staff.id, given: staff.givenName, preferred: staff.preferredName, family: staff.familyName }).from(staff)
          .where(inArray(staff.id, [...new Set(lists.map((l) => l.ownerStaffId))]))).map((o) => [o.id, `${o.preferred ?? o.given} ${o.family}`])
      : [],
  );
  const active = lists.filter((l) => !l.archivedAt);
  const archived = lists.filter((l) => l.archivedAt);

  return (
    <div className="grid max-w-4xl gap-8">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Lists</h1>
        <p className="max-w-2xl">
          A list is a saved set of students. Pick them by hand, or save a filter from the student grid so the list keeps itself up to date. Lists are private until you share them.
        </p>
      </header>
      <NewListForm />
      {active.length === 0 ? (
        <p className="voice text-sm text-ink-muted">no lists yet. make one here, or use “save as list” in the student grid.</p>
      ) : (
        <ul className="grid overflow-hidden rounded-lg border border-line-soft">
          {active.map((l) => (
            <li key={l.id} className="border-b border-line-soft last:border-b-0">
              <Link href={`/lists/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised focus-visible:bg-surface-raised">
                <span className="grid">
                  <span className="font-semibold text-ink-title">{l.name}</span>
                  <span className="voice text-xs text-ink-muted">
                    {[l.kind === "dynamic" ? "updates itself" : "picked by hand", l.ownerStaffId === viewer.staffId ? "yours" : `by ${owners.get(l.ownerStaffId) ?? "someone"}`, l.sensitivity !== "standard" ? l.sensitivity : null]
                      .filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="voice cursor-pointer text-ink-muted">archived ({archived.length})</summary>
          <ul className="mt-2 grid gap-1">{archived.map((l) => <li key={l.id}><Link className="text-link hover:underline" href={`/lists/${l.id}`}>{l.name}</Link></li>)}</ul>
        </details>
      )}
    </div>
  );
}
