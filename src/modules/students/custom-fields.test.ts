import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import type { StaffViewer } from "@/core/auth/viewer";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { describeSource, runQuery } from "@/core/query/run";
import { coerceCustomValue, createCustomField, keyFromLabel, setCustomValue, updateCustomField } from "./custom-fields";
import { bulkUpdateStudents } from "./grid";
import { students } from "./schema";

afterAll(async () => {
  await getSql().end();
});

const TEACHER = "jordan.reyes@creoprep.org"; // Syracuse homeroom
const LEADER = "marisol.pena@creoprep.org";
const CTX = { today: "2026-10-09", schoolYearStart: "2026-09-08" };
const as = async (tx: Db, email: string) => (await viewerFor(tx, email)) as StaffViewer;
async function version(tx: Db, id: string) {
  const [r] = await tx.select({ v: students.version, custom: students.custom }).from(students).where(eq(students.id, id));
  return r!;
}

describe("coerceCustomValue", () => {
  const def = (type: string, options: string[] = []) => ({ type, options, label: "Field" }) as Parameters<typeof coerceCustomValue>[0];
  it.each([
    ["number", "1,250", 1250], ["boolean", "Yes", true], ["boolean", "no", false], ["date", "2026-10-09", "2026-10-09"],
    ["text", "  hi  ", "hi"], ["text", "", null],
  ] as const)("%s %j → %j", (type, raw, expected) => {
    expect(coerceCustomValue(def(type), raw)).toEqual({ ok: true, data: expected });
  });
  it("matches options case-insensitively and rejects others", () => {
    expect(coerceCustomValue(def("select", ["Received", "Missing"]), "received")).toEqual({ ok: true, data: "Received" });
    expect(coerceCustomValue(def("multi_select", ["Bus", "Walker"]), "walker, bus, walker")).toEqual({ ok: true, data: ["Walker", "Bus"] });
    expect(coerceCustomValue(def("select", ["Received"]), "maybe")).toMatchObject({ ok: false });
    expect(coerceCustomValue(def("number"), "lots")).toMatchObject({ ok: false });
    expect(coerceCustomValue(def("date"), "10/09/2026")).toMatchObject({ ok: false });
  });
  it("builds keys from labels", () => {
    expect(keyFromLabel("Permission slip (DC trip)")).toBe("permission_slip_dc_trip");
    expect(keyFromLabel("2027 lottery #")).toBe("field_2027_lottery");
  });
});

describe("custom fields", () => {
  it("are defined by admins and leaders only, with unique names", async () => {
    await withSeed(async (tx) => {
      expect(await createCustomField(tx, await as(tx, TEACHER), { label: "Bus route", type: "text" })).toMatchObject({ ok: false });
      const leader = await as(tx, LEADER);
      expect(await createCustomField(tx, leader, { label: "Bus route", type: "text" })).toMatchObject({ ok: true, data: { key: "bus_route" } });
      expect(await createCustomField(tx, leader, { label: "Bus Route", type: "text" })).toMatchObject({ ok: false, error: "A field with that name already exists." });
      expect(await createCustomField(tx, leader, { label: "Dismissal", type: "select" })).toMatchObject({ ok: false, error: "Add at least one option." });
    });
  });

  it("writes one key at a time, keeps other fields, and shows up as a grid column", async () => {
    await withSeed(async (tx) => {
      const leader = await as(tx, LEADER);
      const teacher = await as(tx, TEACHER);
      await createCustomField(tx, leader, { label: "Dismissal", type: "select", options: ["Parent pickup", "Self-dismiss"] });
      await createCustomField(tx, leader, { label: "Locker", type: "number" });
      const cami = await studentIdByName(tx, "Camila", "Martinez");

      const a = await setCustomValue(tx, teacher, { studentId: cami, version: 1, key: "dismissal", value: "self-dismiss" });
      expect(a).toMatchObject({ ok: true, data: { version: 2, value: "Self-dismiss" } });
      const b = await setCustomValue(tx, teacher, { studentId: cami, version: 2, key: "locker", value: "214" });
      expect(b).toMatchObject({ ok: true });
      expect((await version(tx, cami)).custom).toEqual({ dismissal: "Self-dismiss", locker: 214 });

      const cols = await describeSource(tx, teacher, "students");
      expect(cols.find((c) => c.key === "custom.dismissal")).toMatchObject({ type: "enum", group: "Custom fields" });
      const result = await runQuery(tx, teacher, {
        source: "students", columns: ["name", "custom.dismissal", "custom.locker"],
        filters: [{ field: "custom.dismissal", op: "eq", value: "Self-dismiss" }],
      }, CTX);
      expect(result.rows.map((r) => [r.values.name, r.values["custom.locker"]])).toEqual([["Cami Martinez", "214"]]);

      // Clearing removes just that key.
      await setCustomValue(tx, teacher, { studentId: cami, version: 3, key: "locker", value: "" });
      expect((await version(tx, cami)).custom).toEqual({ dismissal: "Self-dismiss" });
    });
  });

  it("enforce each field's sensitivity for editing and in the grid", async () => {
    await withSeed(async (tx) => {
      const leader = await as(tx, LEADER);
      const teacher = await as(tx, TEACHER);
      await createCustomField(tx, leader, { label: "Custody notes", type: "text", sensitivity: "restricted" });
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      expect(await setCustomValue(tx, teacher, { studentId: cami, version: 1, key: "custody_notes", value: "x" })).toMatchObject({
        ok: false, error: "You can't change that for this student.",
      });
      expect((await describeSource(tx, teacher, "students")).some((c) => c.key === "custom.custody_notes")).toBe(false);
      expect(await setCustomValue(tx, leader, { studentId: cami, version: 1, key: "custody_notes", value: "x" })).toMatchObject({ ok: true });
    });
  });

  it("disappear when archived", async () => {
    await withSeed(async (tx) => {
      const leader = await as(tx, LEADER);
      const created = await createCustomField(tx, leader, { label: "Trip shirt size", type: "select", options: ["S", "M", "L"] });
      if (!created.ok) throw new Error(created.error);
      await updateCustomField(tx, leader, { id: created.data.id, label: "Trip shirt size", options: ["S", "M", "L"], required: false, sensitivity: "standard", helpText: null, archived: true });
      expect((await describeSource(tx, leader, "students")).some((c) => c.key === "custom.trip_shirt_size")).toBe(false);
    });
  });
});

describe("bulk edit", () => {
  it("saves what it can and reports the rest: stale versions and students outside a teacher's homeroom", async () => {
    await withSeed(async (tx) => {
      const leader = await as(tx, LEADER);
      await createCustomField(tx, leader, { label: "DC trip", type: "boolean" });
      const teacher = await as(tx, TEACHER);
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      const [other] = await tx.execute<{ id: string }>(sql`
        select gm.student_id as id from group_memberships gm join groups g on g.id = gm.group_id
        where g.name = 'Syracuse' and gm.student_id <> ${cami} and gm.ends_on is null limit 1`);
      const result = await bulkUpdateStudents(tx, teacher, {
        field: "custom.dc_trip", value: "yes",
        rows: [{ studentId: cami, version: 1 }, { studentId: other!.id, version: 99 }, { studentId: mateo, version: 1 }],
      });
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.data.updated.map((u) => u.studentId)).toEqual([cami]);
      expect(result.data.skipped).toEqual([
        { studentId: other!.id, reason: "Someone else changed this student. Reload to see their change." },
        { studentId: mateo, reason: "You can't change that for this student." },
      ]);
      expect((await version(tx, cami)).custom).toEqual({ dc_trip: true });
    });
  });
});
