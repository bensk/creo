import Link from "next/link";
import { inArray } from "drizzle-orm";
import { requireViewer } from "@/core/auth/server";
import { staff } from "@/core/auth/schema";
import { getDb } from "@/core/db/client";
import { NewTrackerShortcut } from "@/modules/trackers/ui/NewTrackerShortcut";
import { trackersForViewer } from "@/modules/trackers/access";
import { templatesFor } from "@/modules/trackers/manage";

export const metadata = { title: "Trackers" };

const SOURCE: Record<string, string> = { all: "everyone", grade: "a grade", group: "a group", list: "a list", spec: "a filter" };

export default async function TrackersPage() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  const [trackers, templates] = await Promise.all([trackersForViewer(db, viewer), templatesFor(db, viewer)]);
  const owners = new Map(
    trackers.length
      ? (await db.select({ id: staff.id, given: staff.givenName, preferred: staff.preferredName, family: staff.familyName }).from(staff)
          .where(inArray(staff.id, [...new Set(trackers.map((t) => t.ownerStaffId))]))).map((o) => [o.id, `${o.preferred ?? o.given} ${o.family}`])
      : [],
  );
  const active = trackers.filter((t) => !t.archivedAt);
  const archived = trackers.filter((t) => t.archivedAt);

  return (
    <div className="grid max-w-4xl gap-8">
      <header className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Trackers</h1>
          <p className="max-w-2xl">A tracker is a table of students you fill in together: trip eligibility, intervention notes, form collection. It replaces the spreadsheet, and it&apos;s private until you share it.</p>
        </div>
        <Link href="/trackers/new" className="ml-auto flex h-9 items-center rounded-md bg-ink-title px-4 text-sm font-semibold text-surface">
          New tracker <kbd className="voice ml-2 text-xs font-normal opacity-80">n</kbd>
        </Link>
        <NewTrackerShortcut />
      </header>

      {active.length === 0 ? (
        <p className="voice text-sm text-ink-muted">no trackers yet. start one here, or from a group, a list, or the student grid.</p>
      ) : (
        <ul className="grid overflow-hidden rounded-lg border border-line-soft">
          {active.map((t) => (
            <li key={t.id} className="border-b border-line-soft last:border-b-0">
              <Link href={`/trackers/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised focus-visible:bg-surface-raised">
                <span className="grid">
                  <span className="font-semibold text-ink-title">{t.name}</span>
                  <span className="voice text-xs text-ink-muted">
                    {[`${t.populationKind === "live" ? "follows" : "from"} ${SOURCE[t.populationSource] ?? t.populationSource}`, t.ownerStaffId === viewer.staffId ? "yours" : `by ${owners.get(t.ownerStaffId) ?? "someone"}`, t.sensitivity !== "standard" ? t.sensitivity : null]
                      .filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {templates.length > 0 && (
        <section aria-labelledby="templates-h" className="grid gap-2">
          <h2 id="templates-h" className="text-lg font-semibold">Start from a template</h2>
          <ul className="grid gap-1 text-sm">
            {templates.map((t) => (
              <li key={t.id} className="flex items-baseline gap-2">
                <Link href={`/trackers/new?template=${t.id}`} className="text-link hover:underline">{t.name}</Link>
                <span className="voice text-xs text-ink-muted">{t.fields.length} columns{t.mine ? " · yours" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="voice cursor-pointer text-ink-muted">archived ({archived.length})</summary>
          <ul className="mt-2 grid gap-1">{archived.map((t) => <li key={t.id}><Link className="text-link hover:underline" href={`/trackers/${t.id}`}>{t.name}</Link></li>)}</ul>
        </details>
      )}
    </div>
  );
}
