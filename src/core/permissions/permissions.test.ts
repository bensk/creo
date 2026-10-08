import { and, eq, getTableColumns, ne } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import { contacts, students } from "../../modules/students/schema";
import { registry } from "../../modules";
import { sensitiveReads } from "../audit/schema";
import type { StaffViewer } from "../auth/viewer";
import { getSql } from "../db/client";
import type { Db } from "../db/types";
import { CORE_PERMISSIONS } from "./core-permissions";
import { can, Forbidden, authorize, highestLevel, visibleLevels } from "./index";
import { ROLE_PERMISSIONS } from "./matrix";
import { readForViewer } from "./read";

afterAll(async () => {
  await getSql().end();
});

const TEACHER = "jordan.reyes@creoprep.org"; // Syracuse homeroom, 7th grade team
const DEAN = "luis.almonte@creoprep.org"; // teacher + support
const OPS = "yesenia.cruz@creoprep.org";
const COACH = "daniel.okafor@creoprep.org";
const LEADER = "marisol.pena@creoprep.org";

/** Cami is in Syracuse (7th grade); her brother Mateo is in Bloomfield (5th grade). */
async function students2(tx: Db) {
  return { cami: await studentIdByName(tx, "Camila", "Martinez"), mateo: await studentIdByName(tx, "Mateo", "Martinez") };
}

describe("matrix", () => {
  it("only names permissions that exist", () => {
    const known = new Set([...CORE_PERMISSIONS, ...registry.permissions].map((p) => p.key));
    for (const grants of Object.values(ROLE_PERMISSIONS)) {
      for (const key of Object.keys(grants)) expect(known, key).toContain(key);
    }
  });

  it("declares a sensitivity for every column of every student-data table", () => {
    const studentsModule = registry.get("students")!;
    expect(Object.keys(studentsModule.fieldSensitivity!.students!).sort()).toEqual(Object.keys(getTableColumns(students)).sort());
    expect(Object.keys(studentsModule.fieldSensitivity!.contacts!).sort()).toEqual(Object.keys(getTableColumns(contacts)).sort());
  });

  it("ranks levels", () => {
    expect(highestLevel(["standard", "sensitive", "restricted"])).toBe("sensitive");
  });
});

describe("can()", () => {
  it("lets every staff role look up any student", async () => {
    await withSeed(async (tx) => {
      for (const email of [TEACHER, OPS, COACH, LEADER]) {
        expect(await can(tx, await viewerFor(tx, email), "students.view"), email).toBe(true);
      }
    });
  });

  it("denies what a role does not grant", async () => {
    await withSeed(async (tx) => {
      const teacher = await viewerFor(tx, TEACHER);
      expect(await can(tx, teacher, "students.manage_enrollment")).toBe(false);
      expect(await can(tx, teacher, "core.audit.read")).toBe(false);
      await expect(authorize(tx, teacher, "core.audit.read")).rejects.toBeInstanceOf(Forbidden);
      expect(await can(tx, await viewerFor(tx, LEADER), "core.audit.read")).toBe(true);
    });
  });

  it("limits homeroom-scoped permissions to the teacher's own homeroom", async () => {
    await withSeed(async (tx) => {
      const { cami, mateo } = await students2(tx);
      const teacher = await viewerFor(tx, TEACHER);
      expect(await can(tx, teacher, "students.edit_identity", { studentId: cami })).toBe(true);
      expect(await can(tx, teacher, "students.edit_identity", { studentId: mateo })).toBe(false);
      expect(await can(tx, teacher, "students.edit_identity")).toBe(false);
    });
  });

  it("never grants staff permissions to students or families", async () => {
    await withSeed(async (tx) => {
      const student = await viewerFor(tx, "camila.martinez.28@creoprep.org", "student");
      const family = await viewerFor(tx, "rosa.martinez@example.com", "family");
      expect(await can(tx, student, "students.view")).toBe(false);
      expect(await can(tx, family, "students.view")).toBe(false);
    });
  });

  it("refuses unknown permission names loudly", async () => {
    await withSeed(async (tx) => {
      await expect(can(tx, await viewerFor(tx, LEADER), "students.delete_everything")).rejects.toThrow(/Unknown permission/);
    });
  });
});

describe("sensitivity", () => {
  it("gives teachers sensitive fields only for students they work with", async () => {
    await withSeed(async (tx) => {
      const { cami, mateo } = await students2(tx);
      const teacher = await viewerFor(tx, TEACHER);
      expect([...(await visibleLevels(tx, teacher, cami))].sort()).toEqual(["sensitive", "standard"]);
      expect([...(await visibleLevels(tx, teacher, mateo))]).toEqual(["standard"]);
    });
  });

  it("applies each role's levels, and the union for two roles", async () => {
    await withSeed(async (tx) => {
      const { mateo } = await students2(tx);
      expect([...(await visibleLevels(tx, await viewerFor(tx, OPS), mateo))].sort()).toEqual(["restricted", "standard"]);
      expect([...(await visibleLevels(tx, await viewerFor(tx, COACH), mateo))]).toEqual(["standard"]);
      expect((await visibleLevels(tx, await viewerFor(tx, DEAN), mateo)).size).toBe(4);
    });
  });

  it("stops sensitive access when a student leaves the teacher's homeroom", async () => {
    await withSeed(async (tx) => {
      const { cami } = await students2(tx);
      const teacher = await viewerFor(tx, TEACHER);
      const { groupMemberships } = await import("../../modules/cohorts/schema");
      await tx.update(groupMemberships).set({ endsOn: "2026-09-30" }).where(eq(groupMemberships.studentId, cami));
      expect([...(await visibleLevels(tx, teacher, cami))]).toEqual(["standard"]);
    });
  });

  it("redacts restricted fields and logs the sensitive fields it shows", async () => {
    await withSeed(async (tx) => {
      const { cami } = await students2(tx);
      const [row] = await tx.select().from(students).where(eq(students.id, cami));

      const teacher = (await viewerFor(tx, TEACHER)) as StaffViewer;
      const forTeacher = await readForViewer(tx, teacher, "students", cami, row!);
      expect(forTeacher.osis).toBeUndefined();
      expect(forTeacher.dateOfBirth).toBeUndefined();
      expect(forTeacher.preferredFirstName).toBe("Cami");

      const ops = (await viewerFor(tx, OPS)) as StaffViewer;
      const forOps = await readForViewer(tx, ops, "students", cami, row!);
      expect(forOps.osis).toMatch(/^999/);

      const logged = await tx
        .select({ actor: sensitiveReads.actorUserId, field: sensitiveReads.field })
        .from(sensitiveReads)
        .where(and(eq(sensitiveReads.entityId, cami), ne(sensitiveReads.field, "")));
      expect(logged.filter((l) => l.actor === teacher.userId)).toEqual([]);
      expect(logged.filter((l) => l.actor === ops.userId).map((l) => l.field).sort()).toEqual(["dateOfBirth", "osis"]);
    });
  });

  it("drops fields with no declared sensitivity (default deny)", async () => {
    await withSeed(async (tx) => {
      const { cami } = await students2(tx);
      const leader = await viewerFor(tx, LEADER);
      const visible = await readForViewer(tx, leader, "students", cami, { preferredFirstName: "Cami", secretNewColumn: "x" });
      expect(visible).toEqual({ preferredFirstName: "Cami" });
    });
  });
});

