import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { viewerFor, withSeed } from "../../../tests/helpers/db";
import { studentSupports } from "../../modules/students/schema";
import { sensitiveReads } from "../audit/schema";
import { getSql } from "../db/client";
import type { Db } from "../db/types";
import { Forbidden } from "../permissions";
import { QueryError, runQuery } from "./run";

afterAll(async () => {
  await getSql().end();
});

const TEACHER = "jordan.reyes@creoprep.org"; // Syracuse homeroom, 7th grade team
const OPS = "yesenia.cruz@creoprep.org";
const LEADER = "marisol.pena@creoprep.org";
const CTX = { today: "2026-10-09", schoolYearStart: "2026-09-08" };
const q = (tx: Db, email: string, spec: Parameters<typeof runQuery>[2], surface: "staff" | "student" = "staff") =>
  viewerFor(tx, email, surface).then((v) => runQuery(tx, v, spec, CTX));

describe("students source", () => {
  it("returns default columns for every enrolled student, with contributed fields", async () => {
    await withSeed(async (tx) => {
      const result = await q(tx, TEACHER, { source: "students" });
      expect(result.rows).toHaveLength(400);
      expect(result.columns.map((c) => c.key)).toEqual(
        expect.arrayContaining(["name", "phonetic", "grade", "homeroom", "attendanceRate", "absences", "netPoints", "medicalAlert"]),
      );
      const cami = result.rows.find((r) => r.values.name === "Cami Martinez")!;
      expect(cami.values).toMatchObject({ grade: 7, homeroom: "Syracuse", phonetic: "kah-MEE-lah", status: "active" });
      expect(Number(cami.values.attendanceRate)).toBeGreaterThan(0);
      expect(cami.version).toBe(1);
    });
  });

  it("leaves out restricted columns for teachers and keeps them for ops", async () => {
    await withSeed(async (tx) => {
      const asTeacher = await q(tx, TEACHER, { source: "students", columns: ["name", "osis", "gender"] });
      expect(asTeacher.columns.map((c) => c.key)).toEqual(["name"]);
      const asOps = await q(tx, OPS, { source: "students", columns: ["name", "osis", "iep"], filters: [{ field: "osis", op: "starts_with", value: "999" }] });
      expect(asOps.columns.map((c) => c.key)).toEqual(["name", "osis"]); // ops sees no supports
      expect(asOps.rows).toHaveLength(400);
    });
  });

  it("shows teachers IEP status only for their own students, and never lets them filter or sort by it", async () => {
    await withSeed(async (tx) => {
      const result = await q(tx, TEACHER, { source: "students", columns: ["name", "grade", "iep"] });
      const iep = result.columns.find((c) => c.key === "iep")!;
      expect(iep.partial).toBe(true);
      const fifth = result.rows.filter((r) => r.values.grade === 5);
      expect(fifth.every((r) => r.values.iep === null)).toBe(true);
      expect(result.rows.filter((r) => r.values.grade === 7).some((r) => r.values.iep === true)).toBe(true);

      await expect(q(tx, TEACHER, { source: "students", filters: [{ field: "iep", op: "is_true" }] })).rejects.toThrow(/can't filter on "IEP"/);
      await expect(q(tx, TEACHER, { source: "students", sort: [{ field: "iep", dir: "desc" }] })).rejects.toThrow(/can't sort by "IEP"/);
    });
  });

  it("lets leaders filter on sensitive fields, and logs the read", async () => {
    await withSeed(async (tx) => {
      const leader = await viewerFor(tx, LEADER);
      const result = await runQuery(tx, leader, { source: "students", columns: ["name", "iep"], filters: [{ field: "iep", op: "is_true" }] }, CTX);
      const ieps = await tx.select({ s: studentSupports.studentId }).from(studentSupports).where(eq(studentSupports.type, "iep"));
      expect(result.rows).toHaveLength(new Set(ieps.map((r) => r.s)).size);
      const logged = await tx.select().from(sensitiveReads).where(eq(sensitiveReads.actorUserId, leader.userId));
      expect(logged.map((l) => [l.entity, l.field])).toEqual([["students", "iep"]]);
    });
  });

  it("filters, searches, and sorts", async () => {
    await withSeed(async (tx) => {
      const syracuse = await q(tx, TEACHER, { source: "students", filters: [{ field: "homeroom", op: "eq", value: "Syracuse" }] });
      expect(syracuse.rows.length).toBeGreaterThan(20);
      expect(syracuse.rows.every((r) => r.values.homeroom === "Syracuse")).toBe(true);

      const chronic = await q(tx, TEACHER, { source: "students", filters: [{ field: "attendanceRate", op: "lt", value: 90 }, { field: "grade", op: "in", value: [7, 8] }] });
      expect(chronic.rows.length).toBeGreaterThan(0);
      expect(chronic.rows.every((r) => Number(r.values.attendanceRate) < 90 && [7, 8].includes(r.values.grade as number))).toBe(true);

      const found = await q(tx, TEACHER, { source: "students", search: "cami mart" });
      expect(found.rows.map((r) => r.values.name)).toEqual(["Cami Martinez"]);

      const byPoints = await q(tx, TEACHER, { source: "students", sort: [{ field: "netPoints", dir: "desc" }] });
      const pts = byPoints.rows.map((r) => r.values.netPoints as number);
      expect(pts).toEqual([...pts].sort((a, b) => b - a));
    });
  });

  it("rejects unknown fields, wrong operators, and bad values; values are never SQL", async () => {
    await withSeed(async (tx) => {
      await expect(q(tx, LEADER, { source: "students", filters: [{ field: "password", op: "eq", value: "x" }] })).rejects.toThrow(/Unknown field/);
      await expect(q(tx, LEADER, { source: "students", filters: [{ field: "grade", op: "contains", value: "7" }] })).rejects.toThrow(/doesn't apply/);
      await expect(q(tx, LEADER, { source: "students", filters: [{ field: "grade", op: "eq", value: "7; drop table students" }] })).rejects.toThrow(/needs a number/);
      await expect(q(tx, LEADER, { source: "students", filters: [{ field: "status", op: "eq", value: "deleted" }] })).rejects.toThrow(/one of/);
      const injected = await q(tx, LEADER, { source: "students", filters: [{ field: "name", op: "contains", value: "x' or '1'='1" }] });
      expect(injected.rows).toEqual([]);
      await expect(q(tx, LEADER, { source: "nope" })).rejects.toBeInstanceOf(QueryError);
    });
  });

  it("is staff only", async () => {
    await withSeed(async (tx) => {
      await expect(q(tx, "camila.martinez.28@creoprep.org", { source: "students" }, "student")).rejects.toBeInstanceOf(Forbidden);
    });
  });
});
