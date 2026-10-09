import { inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { readAuditLog } from "@/core/audit/read";
import { requireViewer } from "@/core/auth/server";
import { getDb } from "@/core/db/client";
import { users } from "@/core/identity/schema";
import { can } from "@/core/permissions";

export const metadata = { title: "Change log" };

const ACTION_LABELS: Record<string, string> = {
  "auth.sign_in": "Signed in",
  "auth.sign_out": "Signed out",
  "ai.grant": "Granted AI",
  "ai.revoke": "Revoked AI",
};

export default async function ChangeLog() {
  const viewer = await requireViewer("staff");
  const db = getDb();
  if (!(await can(db, viewer, "core.audit.read"))) notFound();

  const entries = await readAuditLog(db, viewer, { limit: 100 });
  const actorIds = [...new Set(entries.map((e) => e.actorUserId))];
  const actors = actorIds.length
    ? new Map((await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, actorIds))).map((u) => [u.id, u.name]))
    : new Map<string, string>();
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="grid max-w-4xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Change log</h1>
        <p className="voice text-sm text-ink-muted">the latest 100 changes. kept forever; nobody can edit it.</p>
      </header>
      <div className="overflow-x-auto rounded-lg border border-line-soft">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-surface-raised text-left text-ink-title">
            <tr>
              <th className="px-4 py-2 font-semibold">When</th>
              <th className="px-4 py-2 font-semibold">Who</th>
              <th className="px-4 py-2 font-semibold">What</th>
              <th className="px-4 py-2 font-semibold">How</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line-soft">
                <td className="data whitespace-nowrap px-4 py-2 text-ink-muted">{time.format(e.at)}</td>
                <td className="px-4 py-2">{actors.get(e.actorUserId) ?? "Unknown"}</td>
                <td className="px-4 py-2">{ACTION_LABELS[e.action] ?? e.action}</td>
                <td className="voice px-4 py-2 text-xs text-ink-muted">{e.via}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <p className="voice p-6 text-center text-sm text-ink-muted">nothing yet.</p>}
      </div>
    </div>
  );
}
