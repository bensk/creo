"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { signOutAction } from "../auth/actions";
import type { Destination } from "./destinations";
import { KeyCaps } from "./keyboard/KeyCaps";
import { useKeyboard, useShortcut } from "./keyboard/KeyboardProvider";
import { setThemeAction } from "./theme-actions";
import type { Theme } from "./theme";

export interface StudentResult {
  id: string;
  name: string;
  grade: number | null;
  homeroom: string | null;
  enrolled: boolean;
}

type SearchStudents = (input: { query: string }) => Promise<StudentResult[]>;

/** ⌘K / Ctrl K: find students and go anywhere. Every item is reachable by keyboard. */
export function CommandPalette({
  destinations,
  searchStudents,
}: {
  destinations: readonly Destination[];
  /** Absent when the viewer can't look up students. */
  searchStudents?: SearchStudents;
}) {
  const router = useRouter();
  const { openHelp } = useKeyboard();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Results remember the query they answer, so stale results never show.
  const [results, setResults] = useState<{ query: string; students: StudentResult[] }>({ query: "", students: [] });
  const [searching, startSearch] = useTransition();
  const latestQuery = useRef("");
  const trimmed = query.trim();
  const students = results.query === trimmed ? results.students : [];

  useShortcut({ keys: "mod+k", description: "Search students, places, and actions", group: "Anywhere", run: () => setOpen((o) => !o) });
  // "/" focuses the current screen's search; screens without one fall back to the palette.
  useShortcut({
    keys: "/",
    description: "Search on this screen",
    group: "Anywhere",
    run: () => {
      const target = document.querySelector<HTMLElement>("[data-screen-search]");
      if (target) target.focus();
      else setOpen(true);
    },
  });

  useEffect(() => {
    latestQuery.current = trimmed;
    if (!searchStudents || trimmed.length < 2) return;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await searchStudents({ query: trimmed });
        if (latestQuery.current === trimmed) setResults({ query: trimmed, students: found });
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [trimmed, searchStudents]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const theme = async (t: Theme) => {
    close();
    await setThemeAction(t);
    router.refresh();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      label="Command palette"
      shouldFilter
      loop
      overlayClassName="fixed inset-0 z-40 bg-scrim"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-xl"
    >
      <div className="flex items-center gap-3 border-b border-line-soft px-4">
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="find a student, or go somewhere…"
          className="voice h-14 w-full bg-transparent text-base text-ink-title outline-none placeholder:text-ink-muted"
        />
        {searching && <span className="voice shrink-0 text-xs text-ink-muted">looking…</span>}
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="voice px-3 py-6 text-center text-sm text-ink-muted">
          {query.trim().length >= 2 && searchStudents ? "no students or places match that" : "nothing matches that"}
        </Command.Empty>

        {students.length > 0 && (
          <Group heading="students">
            {students.map((s) => (
              <Item
                key={s.id}
                value={`student ${s.name} ${s.id}`}
                keywords={[query]}
                onSelect={() => go(`/students/${s.id}`)}
              >
                <span className="font-medium text-ink-title">{s.name}</span>
                <span className="voice ml-auto text-xs text-ink-muted">
                  {s.enrolled
                    ? [s.grade ? `grade ${s.grade}` : null, s.homeroom].filter(Boolean).join(" · ")
                    : "not enrolled"}
                </span>
              </Item>
            ))}
          </Group>
        )}

        <Group heading="go to">
          {destinations.map((d) => (
            <Item key={d.href} value={`go ${d.label}`} onSelect={() => go(d.href)}>
              <span>{d.label}</span>
              {d.goKey && <KeyCaps keys={`g ${d.goKey}`} className="ml-auto" />}
            </Item>
          ))}
        </Group>

        <Group heading="actions">
          <Item value="keyboard shortcuts help" onSelect={() => { close(); openHelp(); }}>
            <span>Keyboard shortcuts</span>
            <KeyCaps keys="?" className="ml-auto" />
          </Item>
          <Item value="theme light" onSelect={() => theme("light")}>Use light theme</Item>
          <Item value="theme dark" onSelect={() => theme("dark")}>Use dark theme</Item>
          <Item value="theme system" onSelect={() => theme("system")}>Match my device&apos;s theme</Item>
          <Item
            value="sign out"
            onSelect={() => {
              const form = new FormData();
              form.set("surface", "staff");
              void signOutAction(form);
            }}
          >
            Sign out
          </Item>
        </Group>
      </Command.List>
    </Command.Dialog>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-2 [&_[cmdk-group-heading]]:voice [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-muted"
    >
      {children}
    </Command.Group>
  );
}

function Item(props: React.ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      {...props}
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-surface-sunken data-[selected=true]:text-ink-title"
    />
  );
}
