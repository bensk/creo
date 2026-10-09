import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import { sensitiveReads } from "@/core/audit/schema";
import { getSql } from "@/core/db/client";
import { visibleLevels } from "@/core/permissions";
import { readForViewer } from "@/core/permissions/read";
import { groupMemberships, groups } from "../cohorts/schema";
import { currentPronunciation, supportsForStudent } from "./queries";

afterAll(async () => {
  await getSql().end();
});

describe("supports", () => {
  it("are visible to a teacher for a student in their homeroom, and logged", async () => {
    await withSeed(async (tx) => {
      const teacher = await viewerFor(tx, "jordan.reyes@creoprep.org");
      // The seed guarantees one Syracuse student (not Cami) with an IEP.
      const syracuse = await tx
        .select({ studentId: groupMemberships.studentId })
        .from(groupMemberships)
        .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
        .where(eq(groups.name, "Syracuse"));
      let found = false;
      for (const { studentId } of syracuse) {
        const rows = await supportsForStudent(tx, studentId);
        if (!rows.some((r) => r.type === "iep")) continue;
        expect((await visibleLevels(tx, teacher, studentId)).has("sensitive")).toBe(true);
        const shown = await readForViewer(tx, teacher, "student_supports", studentId, rows[0]!, { entityId: rows[0]!.id });
        expect(shown.type).toBeDefined();
        const logged = await tx.select().from(sensitiveReads).where(eq(sensitiveReads.entityId, rows[0]!.id));
        expect(logged.length).toBeGreaterThan(0);
        found = true;
        break;
      }
      expect(found).toBe(true);
    });
  });

  it("are hidden from that teacher for a student they don't work with", async () => {
    await withSeed(async (tx) => {
      const teacher = await viewerFor(tx, "jordan.reyes@creoprep.org");
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      const [ell] = await supportsForStudent(tx, mateo);
      expect(ell?.type).toBe("ell");
      expect((await visibleLevels(tx, teacher, mateo)).has("sensitive")).toBe(false);
      expect(await readForViewer(tx, teacher, "student_supports", mateo, ell!)).toEqual({});
    });
  });

  it("give Cami a pronunciation", async () => {
    await withSeed(async (tx) => {
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      expect(await currentPronunciation(tx, cami)).toMatchObject({ phonetic: "kah-MEE-lah" });
    });
  });
});
