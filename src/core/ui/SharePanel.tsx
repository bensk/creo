"use client";

import { useState, useTransition } from "react";

type Target = { userId: string } | { googleGroupEmail: string };
type ActionResult = { ok: true } | { ok: false; error: string };

export interface ShareRow {
  id: string;
  name: string | null;
  googleGroupEmail: string | null;
  access: string;
}

const SENSITIVITY_NOTE: Record<string, string> = {
  standard: "",
  restricted: "It shows restricted information, so it can only go to people whose role sees that for every student.",
  sensitive: "It shows sensitive information (e.g. IEP or health), so it can only go to people whose role sees that for every student.",
  confidential: "It shows confidential information, so it can only go to people whose role sees that for every student.",
};

/** Who an item is shared with, and (for its owner) adding and removing people or Google Groups. */
export function SharePanel({ shares, candidates, canShare, sensitivity, share, unshare }: {
  shares: ShareRow[];
  candidates: { userId: string; name: string }[];
  canShare: boolean;
  sensitivity: string;
  share: (target: Target, access: "view" | "edit") => Promise<ActionResult | { ok: true; data: unknown }>;
  unshare: (shareId: string) => Promise<ActionResult | { ok: true; data: unknown }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"person" | "group">("person");
  const [person, setPerson] = useState("");
  const [group, setGroup] = useState("");
  const [access, setAccess] = useState<"view" | "edit">("view");
  const run = (work: () => Promise<ActionResult | { ok: true; data: unknown }>, after?: () => void) =>
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error);
      setError(null);
      after?.();
    });
  const field = "h-9 rounded-md border border-line bg-surface px-3 text-sm";

  return (
    <section aria-labelledby="share-h" className="grid gap-2">
      <h2 id="share-h" className="text-lg font-semibold">Shared with</h2>
      {shares.length === 0 ? (
        <p className="voice text-sm text-ink-muted">only the owner{canShare ? " (you)" : ""}. admins and leaders can also view it.</p>
      ) : (
        <ul className="grid gap-1">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center gap-3 text-sm">
              <span className="font-medium text-ink-title">{s.name ?? s.googleGroupEmail}</span>
              <span className="voice text-xs text-ink-muted">{s.googleGroupEmail ? "google group · " : ""}{s.access === "edit" ? "can edit" : "can view"}</span>
              {canShare && (
                <button type="button" disabled={pending} className="ml-auto text-link hover:underline" onClick={() => run(() => unshare(s.id))}>
                  Remove<span className="sr-only"> {s.name ?? s.googleGroupEmail}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canShare && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const target = mode === "person" ? person && { userId: person } : group.trim() && { googleGroupEmail: group.trim() };
            if (target) run(() => share(target, access), () => { setPerson(""); setGroup(""); });
          }}
        >
          <select aria-label="Share with a person or a Google Group" className={field} value={mode} onChange={(e) => setMode(e.target.value as "person" | "group")}>
            <option value="person">A person</option>
            <option value="group">A Google Group</option>
          </select>
          {mode === "person" ? (
            <select aria-label="Person" className={field} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Choose a person</option>
              {candidates.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
            </select>
          ) : (
            <input aria-label="Google Group email" className={`${field} data w-64`} type="email" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="grade7@creoprep.org" />
          )}
          <select aria-label="Access" className={field} value={access} onChange={(e) => setAccess(e.target.value as "view" | "edit")}>
            <option value="view">Can view</option>
            <option value="edit">Can edit</option>
          </select>
          <button type="submit" disabled={pending} className="h-9 rounded-md border border-line px-3 text-sm">Share</button>
        </form>
      )}
      {canShare && SENSITIVITY_NOTE[sensitivity] && <p className="text-xs text-ink-muted">{SENSITIVITY_NOTE[sensitivity]}</p>}
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
    </section>
  );
}
