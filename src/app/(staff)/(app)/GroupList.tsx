"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";

interface GroupRow {
  id: string;
  name: string;
  kind: string;
  role: string;
  students: number;
}

export function GroupList({ groups }: { groups: GroupRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const href = (g: GroupRow) => `/students?group=${g.id}`;

  const move = (delta: number) => {
    const next = Math.max(0, Math.min(groups.length - 1, selected + delta));
    setSelected(next);
    links.current[next]?.focus();
  };
  useShortcut({ keys: "j", description: "Next group", group: "This screen", run: () => move(1) });
  useShortcut({ keys: "k", description: "Previous group", group: "This screen", run: () => move(-1) });
  useShortcut({
    keys: "enter",
    description: "Open the selected group",
    group: "This screen",
    run: () => {
      const g = groups[selected];
      if (g) router.push(href(g));
    },
  });

  return (
    <ul className="grid overflow-hidden rounded-lg border border-line-soft">
      {groups.map((g, i) => (
        <li key={g.id} className="border-b border-line-soft last:border-b-0">
          <Link
            ref={(el) => {
              links.current[i] = el;
            }}
            href={href(g)}
            onFocus={() => setSelected(i)}
            aria-current={i === selected ? "true" : undefined}
            className="flex items-center gap-4 px-4 py-3 hover:bg-surface-raised aria-[current=true]:bg-surface-raised aria-[current=true]:shadow-[inset_3px_0_0_var(--brand-amber)]"
          >
            <span className="grid">
              <span className="font-semibold text-ink-title">{g.name}</span>
              <span className="voice text-xs text-ink-muted">
                {g.kind}, {g.role}
              </span>
            </span>
            <span className="ml-auto text-right">
              <span className="data text-lg text-ink-title">{g.students}</span>
              <span className="voice ml-1 text-xs text-ink-muted">students</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
