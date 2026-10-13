import { slackReceiver } from "@/modules/slack/app";

// /api/slack/commands, /interactions, /events, /options. One receiver handles
// all four; it verifies the signing secret and workspace on every request.
const KINDS = new Set(["commands", "interactions", "events", "options"]);

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const receiver = slackReceiver();
  if (!receiver || !KINDS.has(kind)) return new Response("Not found", { status: 404 });
  return receiver.handle(req);
}
