import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { defaultColumns, describeSource, runQuery } from "@/core/query/run";
import { querySpecSchema, type Filter } from "@/core/query/spec";
import { createListAction } from "@/modules/cohorts/list-actions";
import { getList } from "@/modules/cohorts/lists";
import { getGroup, getSection } from "@/modules/cohorts/queries";
import { canManageFields } from "@/modules/students/custom-fields";
import { listStudentViews } from "@/modules/students/grid";
import { StudentGridLoader } from "@/modules/students/ui/StudentGridLoader";

export const metadata = { title: "Students" };

const UUID = /^[0-9a-f-]{36}$/;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ group?: string; section?: string; list?: string }> }) {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await can(db, viewer, "students.view"))) notFound();
  const params = await searchParams;

  // Links from group, class, and list pages open the grid already filtered.
  let filters: Filter[] = [{ field: "status", op: "eq", value: "active" }];
  let search: string | undefined;
  if (params.group && UUID.test(params.group)) {
    const group = await getGroup(db, viewer.schoolId, params.group);
    if (group) filters = [...filters, { field: "groups", op: "contains", value: group.name }];
  } else if (params.section && UUID.test(params.section)) {
    const section = await getSection(db, viewer.schoolId, params.section);
    if (section) filters = [...filters, { field: "classes", op: "contains", value: section.name }];
  } else if (params.list && UUID.test(params.list)) {
    const found = await getList(db, viewer, params.list);
    if (found?.list.kind === "dynamic") {
      const listSpec = querySpecSchema.parse(found.list.spec);
      filters = listSpec.filters;
      search = listSpec.search;
    }
  }

  const columns = await defaultColumns("students");
  const spec = { source: "students", columns, filters, ...(search ? { search } : {}) };
  const [result, views, canEditIdentity, canEditAlerts] = await Promise.all([
    runQuery(db, viewer, spec),
    listStudentViews(db, viewer),
    // Teachers can edit for their homeroom; the server checks each student on save.
    Promise.resolve(viewer.roles.some((r) => ["teacher", "ops", "leader", "admin", "support"].includes(r))),
    can(db, viewer, "students.edit_alerts"),
  ]);

  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-bold tracking-tight">Students</h1>
      <StudentGridLoader
        fields={await describeSource(db, viewer, "students")}
        initialSpec={spec}
        initialResult={result}
        initialViews={views.map((v) => ({ id: v.id, name: v.name, spec: v.spec, sharing: v.sharing, mine: v.ownerUserId === viewer.userId }))}
        userCanEdit={canEditIdentity || canEditAlerts}
        canManageFields={await canManageFields(db, viewer)}
        saveList={createListAction}
      />
    </div>
  );
}
