"use client";

import { useRef, useState, useTransition } from "react";
import { useShortcut } from "@/core/ui/keyboard/KeyboardProvider";
import { StudentName, type StudentNameParts } from "@/core/ui/StudentName";
import { searchStudentsAction } from "@/modules/students/actions";
import { addGroupMembersAction, addGroupStaffAction, removeGroupMemberAction, removeGroupStaffAction, updateGroupAction } from "../actions";

type Fn = "homeroom_teacher" | "lead" | "member";
interface Found { id: string; nameParts: StudentNameParts; grade: number | null; homeroom: string | null; enrolled: boolean }

const input = "h-9 rounded-md border border-line bg-surface px-3 text-sm";
const button = "h-9 rounded-md border border-line px-3 text-sm disabled:opacity-50";

/** Staff, adding students, rename and archive for one group. Students are listed by the page. */
export function GroupManager({ group, canManage, staff, staffOptions, members }: {
  group: { id: string; name: string; archived: boolean; importManaged: boolean };
  canManage: boolean;
  staff: { id: string; name: string; fn: string }[];
  staffOptions: { id: string; name: string }[];
  members: string[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [newStaff, setNewStaff] = useState({ staffId: "", fn: "member" as Fn });
  const [name, setName] = useState(group.name);
  const search = useRef<HTMLInputElement>(null);
  const canAddStudents = canManage && !group.importManaged && !group.archived;
  useShortcut({ keys: "n", description: "Add a student", group: "This screen", run: () => search.current?.focus() });

  const act = (work: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "That didn't work.");
      setError(null);
      setNotice(done);
    });

  const lookup = (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) return setFound([]);
    start(async () => {
      const results = await searchStudentsAction({ query: q });
      setFound(Array.isArray(results) ? results.filter((r) => r.enrolled && !members.includes(r.id)) : []);
    });
  };

  return (
    <div className="grid gap-6">
      {error && <p role="alert" className="rounded-md border-2 border-crimson bg-surface-raised px-3 py-2 text-sm">{error}</p>}
      {notice && !error && <p role="status" className="text-sm text-ink-muted">{notice}</p>}

      <section aria-labelledby="staff-h" className="grid gap-2">
        <h2 id="staff-h" className="text-lg font-semibold">Staff</h2>
        {staff.length === 0 && <p className="voice text-sm text-ink-muted">no staff yet.</p>}
        <ul className="grid gap-1">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center gap-3 text-sm">
              <span className="font-medium text-ink-title">{s.name}</span>
              <span className="voice text-xs text-ink-muted">{s.fn}</span>
              {canManage && (
                <button type="button" disabled={pending} className="ml-auto text-link hover:underline"
                  onClick={() => act(() => removeGroupStaffAction(group.id, s.id), `Removed ${s.name}.`)}>
                  Remove<span className="sr-only"> {s.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            if (newStaff.staffId) act(() => addGroupStaffAction(group.id, newStaff.staffId, newStaff.fn), "Added to the group.");
          }}>
            <label className="grid gap-1 text-sm">
              <span className="voice text-xs text-ink-muted">add staff</span>
              <select className={input} value={newStaff.staffId} onChange={(e) => setNewStaff({ ...newStaff, staffId: e.target.value })}>
                <option value="">Choose a person</option>
                {staffOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="voice text-xs text-ink-muted">as</span>
              <select className={input} value={newStaff.fn} onChange={(e) => setNewStaff({ ...newStaff, fn: e.target.value as Fn })}>
                <option value="member">Member</option>
                <option value="lead">Lead</option>
                <option value="homeroom_teacher">Homeroom teacher</option>
              </select>
            </label>
            <button type="submit" disabled={pending || !newStaff.staffId} className={button}>Add</button>
          </form>
        )}
      </section>

      {canAddStudents && (
        <section aria-labelledby="add-h" className="grid gap-2">
          <h2 id="add-h" className="text-lg font-semibold">Add students</h2>
          <input ref={search} type="search" value={query} onChange={(e) => lookup(e.target.value)} placeholder="type a name" aria-label="Find a student to add"
            className={`${input} voice w-72`} />
          {found.length > 0 && (
            <ul className="grid max-w-xl gap-1">
              {found.map((f) => (
                <li key={f.id} className="flex items-center gap-3 text-sm">
                  <StudentName student={f.nameParts} className="font-medium text-ink-title" />
                  <span className="voice text-xs text-ink-muted">{[f.grade ? `grade ${f.grade}` : null, f.homeroom].filter(Boolean).join(" · ")}</span>
                  <button type="button" disabled={pending} className="ml-auto text-link hover:underline"
                    onClick={() => act(async () => { const r = await addGroupMembersAction(group.id, [f.id]); if (r.ok) { setQuery(""); setFound([]); } return r; }, "Added.")}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canManage && !group.importManaged && (
        <details className="text-sm">
          <summary className="cursor-pointer">Rename or archive</summary>
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(() => updateGroupAction({ id: group.id, name, archived: group.archived }), "Saved."); }}>
            <input aria-label="Group name" className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <button type="submit" disabled={pending} className={button}>Rename</button>
            <button type="button" disabled={pending} className={button}
              onClick={() => act(() => updateGroupAction({ id: group.id, name, archived: !group.archived }), group.archived ? "Restored." : "Archived. Its history is kept.")}>
              {group.archived ? "Restore" : "Archive"}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

/** Takes one student out of the group. */
export function RemoveStudentButton({ groupId, studentId }: { groupId: string; studentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="ml-auto flex items-center gap-2">
      {error && <span role="alert" className="text-xs">{error}</span>}
      <button type="button" disabled={pending} className="text-sm text-link hover:underline"
        onClick={() => start(async () => { const r = await removeGroupMemberAction(groupId, studentId); if (!r.ok) setError(r.error); })}>
        Remove
      </button>
    </span>
  );
}
