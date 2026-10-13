"use client";

import { useState, useTransition } from "react";
import type { StaffRole } from "@/core/db/columns";
import { approveChannelAction, deleteRuleAction, removeChannelAction, saveRuleAction, sendTestAction } from "../actions";

type Target = "channel" | "dm_role" | "dm_owner";
type Detail = "counts" | "initials" | "names";
interface Rule { id?: string; notificationType: string; target: Target; channelId: string | null; dmRole: string | null; detailLevel: Detail; enabled: boolean }
interface Channel { channelId: string; isPrivate: boolean; allowNames: boolean }

const TARGET_LABEL: Record<Target, string> = { channel: "A channel", dm_role: "A DM to everyone with a role", dm_owner: "A DM to the staff member it's about" };
const DETAIL_LABEL: Record<Detail, string> = { counts: "Counts only", initials: "Initials", names: "Names" };
const ROLES = ["admin", "leader", "ops", "teacher", "support", "coach"];

const input = "h-9 rounded-md border border-line bg-surface px-3 text-sm";
const button = "h-9 rounded-md border border-line px-3 text-sm";

export function SlackSettings({ types, rules, channels, canAllowNames, connected }: {
  types: { type: string; label: string; description: string }[];
  rules: Rule[];
  channels: Channel[];
  canAllowNames: boolean;
  connected: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [channel, setChannel] = useState({ channelId: "", allowNames: false });
  const labelOf = (type: string) => types.find((t) => t.type === type)?.label ?? type;

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const result = await work();
      if (!result.ok) return setError(result.error ?? "That didn't work.");
      setError(null);
      setNotice(done);
    });

  const blank: Rule = { notificationType: types[0]?.type ?? "", target: "channel", channelId: "", dmRole: null, detailLevel: "counts", enabled: true };

  return (
    <div className="grid max-w-4xl gap-10">
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      {notice && !error && <p role="status" className="text-sm text-ink-muted">{notice}</p>}

      <section aria-labelledby="rules-h" className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="rules-h" className="text-lg font-semibold">Notifications</h2>
          {!editing && <button type="button" className="text-sm text-link hover:underline" onClick={() => setEditing(blank)}>Add a rule</button>}
        </div>
        {rules.length === 0 && !editing && <p className="voice text-sm text-ink-muted">no rules yet. nothing is sent to slack.</p>}
        <ul className="grid gap-2">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line-soft p-3 text-sm">
              <span className="font-semibold text-ink-title">{labelOf(r.notificationType)}</span>
              <span className="voice text-xs text-ink-muted">
                {[r.target === "channel" ? `channel ${r.channelId}` : r.target === "dm_role" ? `dm every ${r.dmRole}` : "dm the staff member", DETAIL_LABEL[r.detailLevel].toLowerCase(), r.enabled ? null : "off"].filter(Boolean).join(" · ")}
              </span>
              <span className="ml-auto flex gap-3">
                {connected && <button type="button" disabled={pending} className="text-link hover:underline" onClick={() => run(() => sendTestAction(r.id!).then((x) => (x.ok ? { ok: true } : x)), "Sent a test message.")}>Send test</button>}
                <button type="button" className="text-link hover:underline" onClick={() => setEditing(r)}>Edit</button>
                <button type="button" disabled={pending} className="text-link hover:underline" onClick={() => run(() => deleteRuleAction(r.id!), "Removed the rule.")}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
        {editing && (
          <form
            className="grid gap-3 rounded-lg border border-line-soft p-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const result = await saveRuleAction({ ...editing, channelId: editing.target === "channel" ? (editing.channelId ?? "").trim() : null, dmRole: editing.target === "dm_role" ? (editing.dmRole as StaffRole | null) : null });
                if (result.ok) setEditing(null);
                return result;
              }, "Saved the rule.");
            }}
          >
            <label className="grid gap-1 text-sm">
              <span className="voice text-xs text-ink-muted">notification</span>
              <select className={input} value={editing.notificationType} onChange={(e) => setEditing({ ...editing, notificationType: e.target.value })}>
                {types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
              <span className="text-xs text-ink-muted">{types.find((t) => t.type === editing.notificationType)?.description}</span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="voice text-xs text-ink-muted">send to</span>
              <select className={input} value={editing.target} onChange={(e) => setEditing({ ...editing, target: e.target.value as Target })}>
                {(Object.keys(TARGET_LABEL) as Target[]).map((t) => <option key={t} value={t}>{TARGET_LABEL[t]}</option>)}
              </select>
            </label>
            {editing.target === "channel" && (
              <label className="grid gap-1 text-sm">
                <span className="voice text-xs text-ink-muted">channel id</span>
                <input className={`${input} data`} value={editing.channelId ?? ""} placeholder="C0123456789" onChange={(e) => setEditing({ ...editing, channelId: e.target.value })} />
                <span className="text-xs text-ink-muted">In Slack, open the channel, click its name, and copy the ID at the bottom. Add the SIS app to the channel first.</span>
              </label>
            )}
            {editing.target === "dm_role" && (
              <label className="grid gap-1 text-sm">
                <span className="voice text-xs text-ink-muted">role</span>
                <select className={input} value={editing.dmRole ?? ""} onChange={(e) => setEditing({ ...editing, dmRole: e.target.value })}>
                  <option value="" disabled>Choose a role</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
            <label className="grid gap-1 text-sm">
              <span className="voice text-xs text-ink-muted">detail</span>
              <select className={input} value={editing.detailLevel} onChange={(e) => setEditing({ ...editing, detailLevel: e.target.value as Detail })}>
                {(Object.keys(DETAIL_LABEL) as Detail[]).map((d) => <option key={d} value={d}>{DETAIL_LABEL[d]}</option>)}
              </select>
              {editing.target === "channel" && editing.detailLevel === "names" && (
                <span className="text-xs text-ink-muted">Names need a private channel an admin has approved for names, below.</span>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
              On
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface">Save</button>
              <button type="button" className={button} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="channels-h" className="grid gap-3">
        <h2 id="channels-h" className="text-lg font-semibold">Channels approved for student names</h2>
        <p className="max-w-2xl text-sm">Only private channels can receive names, and only after an admin approves them here. If a channel later becomes public, the SIS sends initials instead.</p>
        <ul className="grid gap-2">
          {channels.map((c) => (
            <li key={c.channelId} className="flex items-center gap-3 rounded-lg border border-line-soft p-3 text-sm">
              <span className="data">{c.channelId}</span>
              <span className="voice text-xs text-ink-muted">{[c.isPrivate ? "private" : "public", c.allowNames ? "names allowed" : "no names"].join(" · ")}</span>
              <button type="button" disabled={pending} className="ml-auto text-link hover:underline" onClick={() => run(() => removeChannelAction(c.channelId), "Removed the channel.")}>Remove</button>
            </li>
          ))}
        </ul>
        {connected ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => approveChannelAction({ channelId: channel.channelId.trim(), allowNames: channel.allowNames }), "Approved the channel.");
            }}
          >
            <label className="grid gap-1 text-sm">
              <span className="voice text-xs text-ink-muted">channel id</span>
              <input className={`${input} data`} value={channel.channelId} placeholder="G0123456789" onChange={(e) => setChannel({ ...channel, channelId: e.target.value })} />
            </label>
            {canAllowNames && (
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={channel.allowNames} onChange={(e) => setChannel({ ...channel, allowNames: e.target.checked })} />
                Allow student names
              </label>
            )}
            <button type="submit" disabled={pending} className={button}>Approve</button>
          </form>
        ) : (
          <p className="voice text-sm text-ink-muted">connect slack to approve channels.</p>
        )}
      </section>
    </div>
  );
}
