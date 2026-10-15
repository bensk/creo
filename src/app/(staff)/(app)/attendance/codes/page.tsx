import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { attendanceCodes } from "@/modules/attendance/schema";
import { CodesEditor } from "@/modules/attendance/ui/CodesEditor";

export const metadata = { title: "Attendance codes" };

export default async function CodesPage() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await can(db, viewer, "attendance.manage"))) notFound();
  const codes = await db.select().from(attendanceCodes).where(eq(attendanceCodes.schoolId, viewer.schoolId)).orderBy(asc(attendanceCodes.position));
  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Attendance codes</h1>
        <p>Each code&apos;s label, and the NYSED SIRS code it reports as.</p>
      </header>
      <CodesEditor codes={codes.map((c) => ({ id: c.id, code: c.code, label: c.label, countsAs: c.countsAs, sirsCode: c.sirsCode }))} />
    </div>
  );
}
