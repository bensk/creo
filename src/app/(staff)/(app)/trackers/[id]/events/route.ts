import { z } from "zod";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { subscribe } from "@/core/realtime/listen";
import { getTracker } from "@/modules/trackers/access";

// Server-Sent Events for one tracker: tells an open page which rows someone
// else changed (ids only). Access is checked when the stream opens; the page
// re-reads the rows with the viewer's own permissions.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("staff");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  if (!(await getTracker(getDb(), viewer, id))) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n");
      const unsubscribe = subscribe((notice) => {
        if (notice.kind !== "tracker" || notice.id !== id) return;
        send(`data: ${JSON.stringify({ rowIds: notice.rowIds, by: notice.by })}\n\n`);
      });
      // Comments keep proxies from closing an idle stream.
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
