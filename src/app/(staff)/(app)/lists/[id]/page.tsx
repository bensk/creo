import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { describeSource } from "@/core/query/run";
import { querySpecSchema, type Filter } from "@/core/query/spec";
import { shareCandidates, sharesOf } from "@/core/sharing/manage";
import { SharePanel } from "@/core/ui/SharePanel";
import { pronunciationAudioUrl, StudentName } from "@/core/ui/StudentName";
import { asShareable, getList, listStudentIds } from "@/modules/cohorts/lists";
import { shareListAction, unshareListAction } from "@/modules/cohorts/list-actions";
import { ListEditor, RemoveFromListButton } from "@/modules/cohorts/ui/ListEditor";
import { rosterFor } from "@/modules/students/queries";

export const metadata = { title: "List" };

const OP: Record<string, string> = {
  eq: "is", neq: "is not", in: "is one of", not_in: "is not one of", contains: "contains", starts_with: "starts with",
  gt: "is more than", gte: "is at least", lt: "is less than", lte: "is at most", between: "is between",
  is_empty: "is empty", is_not_empty: "is not empty", is_true: "is yes", is_false: "is no",
};

function describe(f: Filter, label: string) {
  const v = Array.isArray(f.value) ? f.value.join(", ") : f.value === undefined || f.value === null ? "" : String(f.value);
  return `${label} ${OP[f.op] ?? f.op}${v ? ` ${v}` : ""}`;
}

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("staff");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const found = await getList(db, viewer, id);
  if (!found) notFound();
  const { list, access } = found;
  const canEdit = access === "owner" || access === "edit";
  const canShare = access === "owner" || (await can(db, viewer, "cohorts.view_all_lists"));

  const studentIds = await listStudentIds(db, viewer, list);
  const roster = (await rosterFor(db, viewer.schoolId, studentIds))
    .sort((a, b) => `${a.legalLastName} ${a.legalFirstName}`.localeCompare(`${b.legalLastName} ${b.legalFirstName}`));
  const spec = list.kind === "dynamic" ? querySpecSchema.parse(list.spec) : null;
  const labels = spec ? new Map((await describeSource(db, viewer, "students")).map((c) => [c.key, c.label])) : new Map<string, string>();
  const [shareRows, candidates] = await Promise.all([sharesOf(db, asShareable(list)), canShare ? shareCandidates(db, viewer.schoolId) : []]);

  return (
    <article className="grid max-w-4xl gap-8">
      <header className="grid gap-1 border-b border-line-soft pb-5">
        <h1 className="text-3xl font-bold tracking-tight">{list.name}</h1>
        {list.description && <p>{list.description}</p>}
        <p className="voice text-sm text-ink-muted">
          {[list.kind === "dynamic" ? "updates itself from a filter" : "picked by hand", `${roster.length} students`, list.sensitivity !== "standard" ? `${list.sensitivity}: sharing is limited` : null, access === "view" ? "view only" : null, list.archivedAt ? "archived" : null]
            .filter(Boolean).join(" · ")}
        </p>
        {spec && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {spec.filters.map((f, i) => <span key={i} className="rounded-full border border-line-soft px-2 py-0.5">{describe(f, labels.get(f.field) ?? f.field)}</span>)}
            {spec.search && <span className="rounded-full border border-line-soft px-2 py-0.5">name has “{spec.search}”</span>}
            <Link href={`/students?list=${list.id}`} className="text-link hover:underline">Open in the student grid</Link>
          </div>
        )}
      </header>

      {canEdit && <ListEditor list={{ id: list.id, name: list.name, description: list.description, kind: list.kind as "static" | "dynamic", archived: Boolean(list.archivedAt) }} members={studentIds} />}

      <section aria-labelledby="students-h" className="grid gap-2">
        <h2 id="students-h" className="text-lg font-semibold">Students</h2>
        {roster.length === 0 ? (
          <p className="voice text-sm text-ink-muted">{list.kind === "dynamic" ? "no students match the filter right now." : "no students yet."}</p>
        ) : (
          <ul className="grid overflow-hidden rounded-lg border border-line-soft">
            {roster.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-2 last:border-b-0">
                <Link href={`/students/${s.id}`} className="font-medium text-ink-title hover:underline">
                  <StudentName student={s} phonetic={s.phonetic} audioUrl={s.audioId ? pronunciationAudioUrl(s.audioId) : null} />
                </Link>
                <span className="voice text-xs text-ink-muted">{s.grade ? `grade ${s.grade}` : ""}</span>
                {canEdit && list.kind === "static" && <RemoveFromListButton listId={list.id} studentId={s.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SharePanel
        shares={shareRows.map((s) => ({ id: s.id, name: s.name, googleGroupEmail: s.googleGroupEmail, access: s.access }))}
        candidates={candidates.filter((c) => c.userId !== viewer.userId)}
        canShare={canShare}
        sensitivity={list.sensitivity}
        share={shareListAction.bind(null, list.id)}
        unshare={unshareListAction.bind(null, list.id)}
      />
    </article>
  );
}
