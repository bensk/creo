import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import type { StaffViewer } from "@/core/auth/viewer";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { shareItem } from "@/core/sharing/manage";
import { addGroupMembers, createGroup, removeGroupMember } from "../cohorts/manage";
import { groups } from "../cohorts/schema";
import { asShareable, getTracker } from "./access";
import { addTrackerField, addTrackerRows, archiveTrackerField, createTracker, removeTrackerRow, saveTrackerTemplate, setTrackerCell, templatesFor } from "./manage";
import { syncLiveRows } from "./population";
import { trackerRows } from "./schema";
import { loadTrackerTable } from "./table";

afterAll(async () => {
  await getSql().end();
});

const TEACHER = "jordan.reyes@creoprep.org"; // Syracuse homeroom
const SUPPORT = "aaliyah.brooks@creoprep.org";
const OPS = "yesenia.cruz@creoprep.org";
const LEADER = "marisol.pena@creoprep.org";
const COACH = "daniel.okafor@creoprep.org";
const as = async (tx: Db, email: string) => (await viewerFor(tx, email)) as StaffViewer;
const groupId = async (tx: Db, name: string) => (await tx.select({ id: groups.id }).from(groups).where(and(eq(groups.name, name), eq(groups.type, "homeroom"))))[0]!.id;

describe("trackers", () => {
  it("a teacher tracks their homeroom: typed and computed columns, one cell at a time", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const made = await createTracker(tx, teacher, {
        name: "DC Trip 2027",
        population: { source: "group", kind: "live", ref: await groupId(tx, "Syracuse") },
        fields: [{ type: "boolean", label: "Permission slip" }, { type: "computed", label: "Attendance", field: "attendanceRate" }],
      });
      expect(made.ok).toBe(true);
      if (!made.ok) return;
      expect(made.data.students).toBeGreaterThan(10);
      const found = await getTracker(tx, teacher, made.data.id);
      expect(found).toMatchObject({ access: "owner", tracker: { sensitivity: "standard" } });

      const table = await loadTrackerTable(tx, teacher, found!.tracker, true);
      expect(table.columns.map((c) => [c.label, c.editable])).toEqual([["Permission slip", true], ["Attendance", false]]);
      expect(table.rows.length).toBe(made.data.students);
      expect(table.rows.some((r) => typeof r.values.attendance === "string" || typeof r.values.attendance === "number")).toBe(true);

      const row = table.rows[0]!;
      const set = await setTrackerCell(tx, teacher, { trackerId: made.data.id, rowId: row.rowId, key: "permission_slip", value: "yes", expected: null });
      expect(set).toEqual({ ok: true, data: { version: row.version + 1, value: true } });
      // Someone who still saw it empty is told, rather than overwriting.
      expect(await setTrackerCell(tx, teacher, { trackerId: made.data.id, rowId: row.rowId, key: "permission_slip", value: "no", expected: null }))
        .toMatchObject({ ok: false, error: /Someone else just changed “Permission slip”/ });
      expect(await setTrackerCell(tx, teacher, { trackerId: made.data.id, rowId: row.rowId, key: "attendance", value: "100", expected: null }))
        .toMatchObject({ ok: false, error: /computed/ });

      // Two people editing different cells of the same row don't collide.
      await addTrackerField(tx, teacher, { trackerId: made.data.id, field: { type: "number", label: "Deposit" } });
      const other = table.rows[1]!;
      expect((await setTrackerCell(tx, teacher, { trackerId: made.data.id, rowId: other.rowId, key: "permission_slip", value: true, expected: null })).ok).toBe(true);
      expect((await setTrackerCell(tx, teacher, { trackerId: made.data.id, rowId: other.rowId, key: "deposit", value: "25", expected: null })).ok).toBe(true);
    });
  });

  it("a live tracker follows its group, keeping values for students who come back", async () => {
    await withSeed(async (tx) => {
      const ops = await as(tx, OPS);
      const group = await createGroup(tx, ops, { type: "intervention", name: "Tier 2 Math", gradeLevel: 7 });
      if (!group.ok) throw new Error(group.error);
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      await addGroupMembers(tx, ops, { groupId: group.data.id, studentIds: [cami, mateo] });
      const made = await createTracker(tx, ops, { name: "Tier 2 Math notes", population: { source: "group", kind: "live", ref: group.data.id }, fields: [{ type: "text", label: "Goal" }] });
      if (!made.ok) throw new Error(made.error);
      const tracker = (await getTracker(tx, ops, made.data.id))!.tracker;
      const [mateoRow] = await tx.select().from(trackerRows).where(and(eq(trackerRows.trackerId, tracker.id), eq(trackerRows.studentId, mateo)));
      await setTrackerCell(tx, ops, { trackerId: tracker.id, rowId: mateoRow!.id, key: "goal", value: "Fractions", expected: null });

      await removeGroupMember(tx, ops, { groupId: group.data.id, studentId: mateo });
      expect(await syncLiveRows(tx, tracker, ops, ops.userId)).toEqual({ added: 0, archived: 1 });
      expect((await loadTrackerTable(tx, ops, tracker, true)).rows.map((r) => r.studentId)).toEqual([cami]);

      await addGroupMembers(tx, ops, { groupId: group.data.id, studentIds: [mateo] });
      expect(await syncLiveRows(tx, tracker, ops, ops.userId)).toEqual({ added: 1, archived: 0 });
      const back = (await loadTrackerTable(tx, ops, tracker, true)).rows.find((r) => r.studentId === mateo);
      expect(back?.values.goal).toBe("Fractions");
    });
  });

  it("inherits sensitivity from its population and columns, and sharing respects it", async () => {
    await withSeed(async (tx) => {
      const support = await as(tx, SUPPORT);
      const made = await createTracker(tx, support, {
        name: "Testing accommodations",
        population: { source: "spec", kind: "live", spec: { source: "students", filters: [{ field: "iep", op: "is_true" }] } },
        fields: [{ type: "text", label: "Room" }],
      });
      if (!made.ok) throw new Error(made.error);
      const tracker = (await getTracker(tx, support, made.data.id))!.tracker;
      expect(tracker.sensitivity).toBe("sensitive");
      const teacher = await as(tx, TEACHER);
      expect(await shareItem(tx, support, asShareable(tracker), "trackers.create", false, { target: { userId: teacher.userId }, access: "view" }))
        .toMatchObject({ ok: false });

      // Shared with a leader, then a confidential column is still fine (leaders see confidential)...
      const leader = await as(tx, LEADER);
      expect((await shareItem(tx, support, asShareable(tracker), "trackers.create", false, { target: { userId: leader.userId }, access: "view" })).ok).toBe(true);
      expect((await addTrackerField(tx, support, { trackerId: tracker.id, field: { type: "long_text", label: "Counselor notes", sensitivity: "confidential" } })).ok).toBe(true);
      expect((await getTracker(tx, support, tracker.id))!.tracker.sensitivity).toBe("confidential");
    });
  });

  it("refuses a column more sensitive than someone it's shared with may see", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const made = await createTracker(tx, teacher, { name: "Field day", population: { source: "grade", kind: "live", grade: 7 }, fields: [] });
      if (!made.ok) throw new Error(made.error);
      const tracker = (await getTracker(tx, teacher, made.data.id))!.tracker;
      const coach = await as(tx, COACH);
      expect((await shareItem(tx, teacher, asShareable(tracker), "trackers.create", false, { target: { userId: coach.userId }, access: "edit" })).ok).toBe(true);
      expect(await addTrackerField(tx, teacher, { trackerId: tracker.id, field: { type: "text", label: "Health note", sensitivity: "sensitive" } }))
        .toMatchObject({ ok: false, error: /couldn't see it/ });
      // The coach can edit typed columns.
      expect((await addTrackerField(tx, coach, { trackerId: tracker.id, field: { type: "text", label: "Team color" } })).ok).toBe(true);
    });
  });

  it("snapshot trackers take students by hand; templates save the columns", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      const made = await createTracker(tx, teacher, {
        name: "Science fair", population: { source: "spec", kind: "snapshot", spec: { source: "students", filters: [{ field: "grade", op: "eq", value: 7 }], search: "cami mart" } },
        fields: [{ type: "select", label: "Project status", options: ["Not started", "Draft", "Done"] }],
      });
      if (!made.ok) throw new Error(made.error);
      expect(made.data.students).toBe(1);
      expect(await addTrackerRows(tx, teacher, { trackerId: made.data.id, studentIds: [mateo] })).toEqual({ ok: true, data: { added: 1 } });
      const tracker = (await getTracker(tx, teacher, made.data.id))!.tracker;
      const rows = (await loadTrackerTable(tx, teacher, tracker, true)).rows;
      expect(rows.map((r) => r.studentId).sort()).toEqual([cami, mateo].sort());
      expect(await removeTrackerRow(tx, teacher, { trackerId: tracker.id, rowId: rows.find((r) => r.studentId === mateo)!.rowId })).toEqual({ ok: true, data: null });

      const saved = await saveTrackerTemplate(tx, teacher, { trackerId: tracker.id, name: "Science fair (template)", sharedWithSchool: true });
      expect(saved.ok).toBe(true);
      const templates = await templatesFor(tx, await as(tx, OPS));
      expect(templates.find((t) => t.name === "Science fair (template)")?.fields).toEqual([{ type: "select", label: "Project status", options: ["Not started", "Draft", "Done"], sensitivity: "standard" }]);
    });
  });

  it("rule columns answer yes or no from other columns, and say what's missing", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const made = await createTracker(tx, teacher, {
        name: "DC Trip 2027", population: { source: "group", kind: "live", ref: await groupId(tx, "Syracuse") },
        fields: [
          { type: "boolean", label: "Permission slip" }, { type: "number", label: "Deposit" },
          { type: "computed", label: "Attendance", field: "attendanceRate" },
          { type: "rule", label: "Eligible", all: [
            { column: "permission_slip", op: "is_true" }, { column: "deposit", op: "gte", value: 50 }, { column: "attendance", op: "gte", value: 0 },
          ] },
        ],
      });
      if (!made.ok) throw new Error(made.error);
      const tracker = (await getTracker(tx, teacher, made.data.id))!.tracker;
      let table = await loadTrackerTable(tx, teacher, tracker, true);
      expect(table.columns.find((c) => c.key === "eligible")).toMatchObject({ type: "rule", editable: false });
      const row = table.rows[0]!;
      expect(table.rows[0]!.missing.eligible).toEqual(["Permission slip is yes", "Deposit is at least 50"]);

      await setTrackerCell(tx, teacher, { trackerId: tracker.id, rowId: row.rowId, key: "permission_slip", value: true, expected: null });
      await setTrackerCell(tx, teacher, { trackerId: tracker.id, rowId: row.rowId, key: "deposit", value: "75", expected: null });
      table = await loadTrackerTable(tx, teacher, tracker, true);
      const after = table.rows.find((r) => r.rowId === row.rowId)!;
      expect(after.values.eligible).toBe(true);
      expect(after.missing.eligible).toBeUndefined();

      expect(await archiveTrackerField(tx, teacher, { trackerId: tracker.id, key: "deposit" })).toMatchObject({ ok: false, error: /Eligible/ });
      expect(await addTrackerField(tx, teacher, { trackerId: tracker.id, field: { type: "rule", label: "Bad", all: [{ column: "nope", op: "is_true" }] } }))
        .toMatchObject({ ok: false, error: /doesn't exist/ });
      expect(await addTrackerField(tx, teacher, { trackerId: tracker.id, field: { type: "rule", label: "Nested", all: [{ column: "eligible", op: "is_true" }] } }))
        .toMatchObject({ ok: false, error: /another rule/ });

      // Templates keep rules, and a tracker made from one works the same.
      const saved = await saveTrackerTemplate(tx, teacher, { trackerId: tracker.id, name: "Trip", sharedWithSchool: false });
      if (!saved.ok) throw new Error(saved.error);
      const template = (await templatesFor(tx, teacher)).find((t) => t.id === saved.data.id)!;
      const again = await createTracker(tx, teacher, { name: "Trip 2028", population: { source: "grade", kind: "live", grade: 7 }, fields: template.fields, templateId: template.id });
      expect(again.ok).toBe(true);
    });
  });

  it("a coach can't build a tracker from a filter their role can't use", async () => {
    await withSeed(async (tx) => {
      expect(await createTracker(tx, await as(tx, COACH), { name: "x", population: { source: "spec", kind: "live", spec: { source: "students", filters: [{ field: "iep", op: "is_true" }] } } }))
        .toMatchObject({ ok: false });
    });
  });
});
