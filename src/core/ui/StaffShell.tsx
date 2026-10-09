"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CommandPalette, type StudentResult } from "./CommandPalette";
import type { Destination } from "./destinations";
import { KeyboardProvider, useShortcut } from "./keyboard/KeyboardProvider";
import { ThemeSwitch } from "./ThemeSwitch";
import type { Theme } from "./theme";

export function StaffShell({
  name,
  roles,
  destinations,
  searchStudents,
  theme,
  footerExtra,
  children,
}: {
  name: string;
  roles: readonly string[];
  destinations: readonly Destination[];
  searchStudents?: (input: { query: string }) => Promise<StudentResult[]>;
  theme: Theme;
  footerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <KeyboardProvider>
      <GoShortcuts destinations={destinations} />
      <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
        <aside className="border-b border-line-soft bg-surface-raised md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-b-0 md:border-r">
          <div className="flex items-baseline justify-between gap-2 px-5 pt-5 pb-3">
            <Link href="/" className="text-lg font-black tracking-tight text-ink-title">
              Creo <span className="text-amber" aria-hidden>●</span>
            </Link>
            <span className="voice text-xs text-ink-muted">press ? for keys</span>
          </div>
          <Nav destinations={destinations} />
          <div className="mt-auto hidden gap-3 border-t border-line-soft px-5 py-4 md:grid">
            <div>
              <div className="font-medium text-ink-title">{name}</div>
              <div className="voice text-xs text-ink-muted">{roles.join(" · ")}</div>
            </div>
            <ThemeSwitch value={theme} />
            {footerExtra}
          </div>
        </aside>
        <main className="min-w-0 px-5 py-6 md:px-10 md:py-10">{children}</main>
      </div>
      <CommandPalette destinations={destinations} searchStudents={searchStudents} />
    </KeyboardProvider>
  );
}

function Nav({ destinations }: { destinations: readonly Destination[] }) {
  const pathname = usePathname();
  const isActive = (d: Destination) => (d.href === "/" ? pathname === "/" : pathname === d.href || pathname.startsWith(`${d.href}/`));
  return (
    <nav aria-label="Main" className="overflow-x-auto px-3 pb-3 md:overflow-visible">
      <ul className="flex gap-1 md:grid">
        {destinations.map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              aria-current={isActive(d) ? "page" : undefined}
              className="group flex items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-ink hover:bg-surface-sunken aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-ink-title aria-[current=page]:shadow-[inset_3px_0_0_var(--brand-amber)]"
            >
              <span>{d.label}</span>
              {d.goKey && (
                <span className="voice hidden text-xs text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:inline">
                  g {d.goKey}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function GoShortcuts({ destinations }: { destinations: readonly Destination[] }) {
  return (
    <>
      {destinations
        .filter((d) => d.goKey)
        .map((d) => (
          <GoShortcut key={d.href} destination={d} />
        ))}
    </>
  );
}

function GoShortcut({ destination }: { destination: Destination }) {
  const router = useRouter();
  useShortcut({
    keys: `g ${destination.goKey}`,
    description: `Go to ${destination.label}`,
    group: "Go to",
    run: () => router.push(destination.href),
  });
  return null;
}
