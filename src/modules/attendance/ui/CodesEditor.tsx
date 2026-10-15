"use client";

import { useState, useTransition } from "react";
import { updateCodeAction } from "../actions";

interface Code { id: string; code: string; label: string; countsAs: string; sirsCode: string | null }
const field = "h-9 rounded-md border border-line bg-surface px-3 text-sm";

export function CodesEditor({ codes }: { codes: Code[] }) {
  const [drafts, setDrafts] = useState(codes);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        for (const d of drafts) {
          const before = codes.find((c) => c.id === d.id)!;
          if (before.label === d.label && (before.sirsCode ?? "") === (d.sirsCode ?? "")) continue;
          const r = await updateCodeAction({ id: d.id, label: d.label, sirsCode: d.sirsCode?.trim() || null });
          if (!r.ok) return setError(r.error);
        }
        setError(null);
        setNotice("Saved.");
      });
    }}>
      <table className="w-full text-sm">
        <thead className="text-left text-ink-muted"><tr><th className="voice py-1 font-normal">code</th><th className="voice py-1 font-normal">counts as</th><th className="voice py-1 font-normal">label</th><th className="voice py-1 font-normal">sirs code</th></tr></thead>
        <tbody>
          {drafts.map((d, i) => (
            <tr key={d.id} className="border-t border-line-soft">
              <td className="data py-2 text-ink-title">{d.code}</td>
              <td className="py-2">{d.countsAs}</td>
              <td className="py-2"><input aria-label={`Label for ${d.code}`} className={field} value={d.label} maxLength={60} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
              <td className="py-2"><input aria-label={`SIRS code for ${d.code}`} className={`${field} data w-24`} value={d.sirsCode ?? ""} maxLength={10} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, sirsCode: e.target.value } : x)))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      {notice && !error && <p role="status" className="text-sm text-ink-muted">{notice}</p>}
      <div><button type="submit" disabled={pending} className="h-9 rounded-md bg-ink-title px-4 text-sm font-semibold text-surface disabled:opacity-60">Save</button></div>
    </form>
  );
}
