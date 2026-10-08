import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { userIdByEmail, withSeed } from "../../../tests/helpers/db";
import { getSql } from "@/core/db/client";
import { users } from "@/core/identity/schema";
import { currentHomerooms, groupsForStaff } from "../cohorts/queries";
import { staff } from "@/core/auth/schema";
import { enrollments } from "./schema";
import { searchStudents } from "./queries";

afterAll(async () => {
  await getSql().end();
});

describe("searchStudents", () => {
  it("finds by preferred or legal name, with grade and enrollment", async () => {
    await withSeed(async (tx) => {
      const [user] = await tx.select({ schoolId: users.schoolId }).from(users).limit(1);
      for (const query of ["cami mart", "camila martinez"]) {
        const found = await searchStudents(tx, user!.schoolId, query);
        const cami = found.find((s) => s.preferredFirstName === "Cami");
        expect(cami, query).toMatchObject({ legalLastName: "Martinez", grade: 7, enrolled: true });
        expect((await currentHomerooms(tx, [cami!.id])).get(cami!.id)).toBe("Syracuse");
      }
    });
  });

  it("marks withdrawn students as not enrolled and lists them last", async () => {
    await withSeed(async (tx) => {
      const [user] = await tx.select({ schoolId: users.schoolId }).from(users).limit(1);
      const [withdrawn] = await tx.select({ studentId: enrollments.studentId }).from(enrollments).where(eq(enrollments.status, "withdrawn")).limit(1);
      const all = await searchStudents(tx, user!.schoolId, "a", 500);
      const row = all.find((s) => s.id === withdrawn!.studentId);
      expect(row?.enrolled).toBe(false);
      expect(all.at(-1)?.enrolled).toBe(false);
    });
  });

  it("treats % and _ as plain text", async () => {
    await withSeed(async (tx) => {
      const [user] = await tx.select({ schoolId: users.schoolId }).from(users).limit(1);
      expect(await searchStudents(tx, user!.schoolId, "%")).toEqual([]);
    });
  });
});

describe("groupsForStaff", () => {
  it("lists a homeroom teacher's homeroom and grade team with current counts", async () => {
    await withSeed(async (tx) => {
      const userId = await userIdByEmail(tx, "jordan.reyes@creoprep.org");
      const [me] = await tx.select({ id: staff.id }).from(staff).where(eq(staff.userId, userId));
      const groups = await groupsForStaff(tx, me!.id);
      expect(groups.map((g) => [g.name, g.function])).toEqual([
        ["Grade 7 Team", "member"],
        ["Syracuse", "homeroom_teacher"],
      ]);
      const syracuse = groups.find((g) => g.name === "Syracuse")!;
      expect(syracuse.students).toBeGreaterThanOrEqual(22);
      expect(syracuse.students).toBeLessThanOrEqual(27);
    });
  });
});
