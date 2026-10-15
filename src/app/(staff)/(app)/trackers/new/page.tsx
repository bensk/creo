import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { describeSource } from "@/core/query/run";
import { querySpecSchema } from "@/core/query/spec";
import { listsForViewer } from "@/modules/cohorts/lists";
import { listGroups } from "@/modules/cohorts/queries";
import { templatesFor } from "@/modules/trackers/manage";
import type { Population } from "@/modules/trackers/model";
import { NewTrackerFlow } from "@/modules/trackers/ui/NewTrackerFlow";

export const metadata = { title: "New tracker" };

/** "Track these students" entry points pass ?group=, ?list=, ?grade=, ?spec= (from the grid), or ?template=. */
function decodeSpec(raw: string | undefined) {
  if (!raw) return null;
  try {
    const parsed = querySpecSchema.safeParse({ source: "students", ...JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) });
    return parsed.success ? { filters: parsed.data.filters } : null;
  } catch {
    return null;
  }
}

export default async function NewTrackerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer("staff");
  const db = getDb();
  const params = await searchParams;
  const [groups, lists, fields, templates] = await Promise.all([
    listGroups(db, viewer.schoolId),
    listsForViewer(db, viewer),
    describeSource(db, viewer, "students"),
    templatesFor(db, viewer),
  ]);
  const spec = decodeSpec(params.spec);
  const template = templates.find((t) => t.id === params.template) ?? null;
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : null);
  const initial: Population =
    uuid(params.group) && groups.some((g) => g.id === params.group) ? { source: "group", kind: "live", ref: params.group! }
    : uuid(params.list) && lists.some((l) => l.id === params.list) ? { source: "list", kind: "live", ref: params.list! }
    : params.grade && /^[5-8]$/.test(params.grade) ? { source: "grade", kind: "live", grade: Number(params.grade) }
    : spec ? { source: "spec", kind: "live", spec: { source: "students", filters: spec.filters, sort: [], limit: 2000 } }
    : template?.population ?? { source: "grade", kind: "live", grade: 7 };

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-3xl font-bold tracking-tight">New tracker</h1>
      <NewTrackerFlow
        initialPopulation={initial}
        template={template}
        groups={groups.filter((g) => !g.archivedAt).map((g) => ({ id: g.id, name: g.name, type: g.type, students: g.students }))}
        lists={lists.filter((l) => !l.archivedAt).map((l) => ({ id: l.id, name: l.name }))}
        specChips={initial.source === "spec" ? initial.spec.filters.map((f) => `${fields.find((c) => c.key === f.field)?.label ?? f.field} ${f.op.replaceAll("_", " ")}${f.value !== undefined ? ` ${Array.isArray(f.value) ? f.value.join(", ") : String(f.value)}` : ""}`) : []}
        computedChoices={fields.filter((f) => !["name"].includes(f.key)).map((f) => ({ key: f.key, label: f.label, group: f.group, sensitivity: f.sensitivity, partial: f.partial }))}
      />
    </div>
  );
}
