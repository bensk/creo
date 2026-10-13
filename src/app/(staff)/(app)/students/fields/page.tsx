import { notFound } from "next/navigation";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { canManageFields, listCustomFields } from "@/modules/students/custom-fields";
import { CustomFieldsAdmin } from "@/modules/students/ui/CustomFieldsAdmin";

export const metadata = { title: "Custom fields" };

export default async function CustomFieldsPage() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await canManageFields(db, viewer))) notFound();
  const fields = await listCustomFields(db, viewer.schoolId, { includeArchived: true });
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Custom fields</h1>
        <p className="max-w-2xl">Add a field to every student without waiting for a developer. New fields appear as columns in the student grid, where staff can fill them in.</p>
      </header>
      <CustomFieldsAdmin fields={fields} />
    </div>
  );
}
