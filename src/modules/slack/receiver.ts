import { isValidSlackRequest, type App, type Receiver, type ReceiverEvent } from "@slack/bolt";

// Bolt in HTTP mode, served from Next.js route handlers instead of Bolt's own
// server. Every request is checked against the signing secret and the team ID
// before Bolt sees it. Slack needs an answer within 3 seconds: the response is
// sent as soon as a listener calls ack(), and anything slower must be handed
// to the job queue rather than awaited.

const ACK_TIMEOUT_MS = 2500;

export class NextReceiver implements Receiver {
  private app?: App;

  constructor(private readonly options: { signingSecret: string; teamId: string }) {}

  init(app: App): void {
    this.app = app;
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async handle(req: Request): Promise<Response> {
    const raw = await req.text();
    const signature = req.headers.get("x-slack-signature") ?? "";
    const timestamp = Number(req.headers.get("x-slack-request-timestamp") ?? 0);
    const valid = isValidSlackRequest({
      signingSecret: this.options.signingSecret,
      body: raw,
      headers: { "x-slack-signature": signature, "x-slack-request-timestamp": timestamp },
    });
    if (!valid) return new Response("Invalid signature", { status: 401 });

    const body = parseBody(raw, req.headers.get("content-type") ?? "");
    if (!body) return new Response("Bad request", { status: 400 });
    if (body.type === "url_verification") return Response.json({ challenge: body.challenge });
    if (teamOf(body) !== this.options.teamId) return new Response("Wrong workspace", { status: 403 });
    // Slack retries events it thinks we missed; the first delivery already ran.
    if (req.headers.get("x-slack-retry-num")) return new Response(null, { status: 200 });
    if (!this.app) return new Response("Not ready", { status: 503 });

    let respond!: (r: Response) => void;
    const acked = new Promise<Response>((resolve) => (respond = resolve));
    const event: ReceiverEvent = {
      body,
      ack: async (response?: unknown) => {
        if (response === undefined || response === "") respond(new Response(null, { status: 200 }));
        else if (typeof response === "string") respond(new Response(response, { status: 200 }));
        else respond(Response.json(response));
      },
    };
    const processing = this.app.processEvent(event).catch((error: unknown) => {
      // IDs and error names only: payloads can contain student names.
      console.error("slack: listener failed", { type: body.type, error: error instanceof Error ? error.name : "unknown" });
      respond(new Response(null, { status: 500 }));
    });
    const timeout = new Promise<Response>((resolve) =>
      setTimeout(() => resolve(new Response(null, { status: 200 })), ACK_TIMEOUT_MS),
    );
    // Events and actions with no matching listener never ack: answer 200 once processing ends.
    void processing.then(() => respond(new Response(null, { status: 200 })));
    return Promise.race([acked, timeout]);
  }
}

type Body = Record<string, unknown> & { type?: string; challenge?: string };

export function parseBody(raw: string, contentType: string): Body | null {
  try {
    if (contentType.includes("application/json")) return JSON.parse(raw) as Body;
    const params = new URLSearchParams(raw);
    const payload = params.get("payload");
    if (payload) return JSON.parse(payload) as Body;
    return Object.fromEntries(params) as Body;
  } catch {
    return null;
  }
}

export function teamOf(body: Body): string | undefined {
  const team = body.team as { id?: string } | undefined;
  return (body.team_id as string | undefined) ?? team?.id ?? (body.user as { team_id?: string } | undefined)?.team_id;
}
