import { notFound } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { describeSource } from "@/core/query/run";
import { shareCandidates, sharesOf } from "@/core/sharing/manage";
import { SharePanel } from "@/core/ui/SharePanel";
import { asShareable, canEdit, getTracker, trackerOversight } from "@/modules/trackers/access";
import { shareTrackerAction, unshareTrackerAction } from "@/modules/trackers/actions";
import { ownerViewer, syncLiveRows } from "@/modules/trackers/population";
import { loadTrackerTable } from "@/modules/trackers/table";
import { TrackerGridLoader } from "@/modules/trackers/ui/TrackerGridLoader";
import { TrackerTools } from "@/modules/trackers/ui/TrackerTools";

export const metadata = { title: "Tracker" };

const SOURCE: Record<string, string> = { all: "every enrolled student", grade: "a grade", group: "a group", list: "a list", spec: "a filter" };

export default async function TrackerPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("staff");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const found = await getTracker(db, viewer, id);
  if (!found) notFound();
  const { tracker, access } = found;
  const editable = canEdit(access);

  // A live tracker follows its population: catch up whenever someone opens it.
  const sync = tracker.populationKind === "live" ? await syncLiveRows(db, tracker, await ownerViewer(db, tracker, viewer), viewer.userId) : null;
  const table = await loadTrackerTable(db, viewer, tracker, editable);
  const canShare = access === "owner" || (await trackerOversight(db, viewer));
  const [shareRows, candidates, fields] = await Promise.all([
    sharesOf(db, asShareable(tracker)),
    canShare ? shareCandidates(db, viewer.schoolId) : [],
    editable ? describeSource(db, viewer, "students") : [],
  ]);

  return (
    <article className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{tracker.name}</h1>
        {tracker.description && <p>{tracker.description}</p>}
        <p className="voice text-sm text-ink-muted">
          {[`${tracker.populationKind === "live" ? "follows" : "started from"} ${SOURCE[tracker.populationSource] ?? tracker.populationSource}`, `${table.rows.length} students`,
            tracker.sensitivity !== "standard" ? `${tracker.sensitivity}: sharing is limited` : null, access === "view" ? "view only" : null, tracker.archivedAt ? "archived" : null]
            .filter(Boolean).join(" · ")}
        </p>
        {sync && "error" in sync && <p role="note" className="w-fit rounded-md border-2 border-amber px-3 py-1 text-sm">{sync.error} The students below are as of the last update.</p>}
      </header>

      {editable && (
        <TrackerTools
          tracker={{ id: tracker.id, name: tracker.name, description: tracker.description, archived: Boolean(tracker.archivedAt) }}
          columns={table.columns}
          snapshot={tracker.populationKind === "snapshot"}
          computedChoices={fields.filter((f) => f.key !== "name").map((f) => ({ key: f.key, label: f.label, sensitivity: f.sensitivity }))}
        />
      )}

      <TrackerGridLoader trackerId={tracker.id} viewerUserId={viewer.userId} columns={table.columns} initialRows={table.rows} editable={editable && !tracker.archivedAt} snapshot={tracker.populationKind === "snapshot"} />

      <SharePanel
        shares={shareRows.map((s) => ({ id: s.id, name: s.name, googleGroupEmail: s.googleGroupEmail, access: s.access }))}
        candidates={candidates.filter((c) => c.userId !== viewer.userId)}
        canShare={canShare}
        sensitivity={tracker.sensitivity}
        share={shareTrackerAction.bind(null, tracker.id)}
        unshare={unshareTrackerAction.bind(null, tracker.id)}
      />
    </article>
  );
}
