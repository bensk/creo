import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import { auditLog } from "@/core/audit/schema";
import type { StaffViewer } from "@/core/auth/viewer";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { addGroupMembers, addGroupStaff, createGroup, removeGroupMember, updateGroup } from "./manage";
import { groupMembers } from "./queries";
import { groupMemberships, groups } from "./schema";

afterAll(async () => {
  await getSql().end();
});

const OPS = "yesenia.cruz@creoprep.org";
const TEACHER = "jordan.reyes@creoprep.org";
const as = async (tx: Db, email: string) => (await viewerFor(tx, email)) as StaffViewer;

describe("managing groups", () => {
  it("is for admins, leaders, and ops", async () => {
    await withSeed(async (tx) => {
      expect(await createGroup(tx, await as(tx, TEACHER), { type: "intervention", name: "Tier 2 Math", gradeLevel: 7 }))
        .toEqual({ ok: false, error: "Only admins, leaders, and ops can change groups." });
    });
  });

  it("creates a group, adds and removes students, and keeps history", async () => {
    await withSeed(async (tx) => {
      const ops = await as(tx, OPS);
      const created = await createGroup(tx, ops, { type: "intervention", name: "Tier 2 Math", gradeLevel: 7 });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(await createGroup(tx, ops, { type: "intervention", name: "Tier 2 Math", gradeLevel: 7 })).toMatchObject({ ok: false, error: /already exists/ });

      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      expect(await addGroupMembers(tx, ops, { groupId: created.data.id, studentIds: [cami, mateo, cami] })).toEqual({ ok: true, data: { added: 2 } });
      expect(await addGroupMembers(tx, ops, { groupId: created.data.id, studentIds: [cami] })).toMatchObject({ ok: false });
      expect((await groupMembers(tx, created.data.id)).map((m) => m.studentId).sort()).toEqual([cami, mateo].sort());

      expect(await removeGroupMember(tx, ops, { groupId: created.data.id, studentId: mateo })).toEqual({ ok: true, data: null });
      expect((await groupMembers(tx, created.data.id)).map((m) => m.studentId)).toEqual([cami]);
      const audits = await tx.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.actorUserId, ops.userId));
      expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["group.create", "group_membership.create", "group_membership.end"]));

      expect(await updateGroup(tx, ops, { id: created.data.id, name: "Tier 2 Math (spring)", archived: true })).toEqual({ ok: true, data: null });
      expect(await addGroupMembers(tx, ops, { groupId: created.data.id, studentIds: [mateo] })).toMatchObject({ ok: false, error: /archived/ });
    });
  });

  it("leaves homeroom students to the imports, but lets staff change", async () => {
    await withSeed(async (tx) => {
      const ops = await as(tx, OPS);
      const [syracuse] = await tx.select().from(groups).where(and(eq(groups.type, "homeroom"), eq(groups.name, "Syracuse")));
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      expect(await addGroupMembers(tx, ops, { groupId: syracuse!.id, studentIds: [mateo] })).toMatchObject({ ok: false, error: /come from the imports/ });
      expect(await updateGroup(tx, ops, { id: syracuse!.id, name: "Renamed", archived: false })).toMatchObject({ ok: false });
      const teacher = await as(tx, TEACHER);
      expect(await addGroupStaff(tx, ops, { groupId: syracuse!.id, staffId: teacher.staffId, function: "lead" })).toEqual({ ok: true, data: null });
      const before = await tx.select().from(groupMemberships).where(eq(groupMemberships.groupId, syracuse!.id));
      expect(before.length).toBeGreaterThan(0);
    });
  });
});
