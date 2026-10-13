import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { defaultColumns, describeSource, runQuery } from "@/core/query/run";
import { canManageFields } from "@/modules/students/custom-fields";
import { listStudentViews } from "@/modules/students/grid";
import { StudentGridLoader } from "@/modules/students/ui/StudentGridLoader";

export const metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await can(db, viewer, "students.view"))) notFound();
  await searchParams;

  const columns = await defaultColumns("students");
  const spec = { source: "students", columns, filters: [{ field: "status", op: "eq" as const, value: "active" }] };
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
      />
    </div>
  );
}
