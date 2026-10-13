import { z } from "zod";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { can } from "@/core/permissions";
import { pronunciationAudio } from "@/modules/students/pronunciation";

// Streams a name recording to staff who can see students. Recordings are never
// public; this check is the only way to reach one.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("staff");
  const { id } = await params;
  const notFound = () => new Response("Not found", { status: 404 });
  if (!z.uuid().safeParse(id).success) return notFound();
  const db = getDb();
  if (!(await can(db, viewer, "students.view"))) return notFound();
  const object = await pronunciationAudio(db, viewer.schoolId, id);
  if (!object) return notFound();
  return new Response(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.body.length),
      // A pronunciation row never changes (a new recording is a new row).
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
