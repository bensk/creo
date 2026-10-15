import { afterAll, describe, expect, it } from "vitest";
import { studentIdByName, viewerFor, withSeed } from "../../../tests/helpers/db";
import type { StaffViewer } from "@/core/auth/viewer";
import { directoryGroupMembers } from "@/core/auth/schema";
import { getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";
import { shareItem, unshareItem } from "@/core/sharing/manage";
import { addListMembers, asShareable, createList, getList, listsForViewer, listStudentIds, removeListMember } from "./lists";

afterAll(async () => {
  await getSql().end();
});

const LEADER = "marisol.pena@creoprep.org";
const SUPPORT = "aaliyah.brooks@creoprep.org";
const TEACHER = "jordan.reyes@creoprep.org";
const GRADE_LEAD = "tanisha.morgan@creoprep.org";
const COACH = "daniel.okafor@creoprep.org";
const as = async (tx: Db, email: string) => (await viewerFor(tx, email)) as StaffViewer;

describe("lists", () => {
  it("a teacher makes a static list; it's private until shared", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const cami = await studentIdByName(tx, "Camila", "Martinez");
      const mateo = await studentIdByName(tx, "Mateo", "Martinez");
      const made = await createList(tx, teacher, { name: "DC trip: permission slips out", kind: "static", studentIds: [cami] });
      expect(made.ok).toBe(true);
      if (!made.ok) return;
      expect(await addListMembers(tx, teacher, { listId: made.data.id, studentIds: [mateo, cami] })).toEqual({ ok: true, data: { added: 1 } });
      const found = await getList(tx, teacher, made.data.id);
      expect(found?.access).toBe("owner");
      expect((await listStudentIds(tx, teacher, found!.list)).sort()).toEqual([cami, mateo].sort());

      const lead = await as(tx, GRADE_LEAD);
      expect(await getList(tx, lead, made.data.id)).toBeNull();
      expect((await listsForViewer(tx, lead)).map((l) => l.id)).not.toContain(made.data.id);
      // Leaders see every list (oversight), read-only.
      expect((await getList(tx, await as(tx, LEADER), made.data.id))?.access).toBe("view");

      const shared = await shareItem(tx, teacher, asShareable(found!.list), "cohorts.create_lists", false, { target: { userId: lead.userId }, access: "edit" });
      expect(shared.ok).toBe(true);
      expect((await getList(tx, lead, made.data.id))?.access).toBe("edit");
      expect((await listsForViewer(tx, lead)).map((l) => l.id)).toContain(made.data.id);
      expect(await removeListMember(tx, lead, { listId: made.data.id, studentId: mateo })).toEqual({ ok: true, data: null });
      expect(await listStudentIds(tx, teacher, found!.list)).toEqual([cami]);

      if (shared.ok) expect(await unshareItem(tx, teacher, asShareable(found!.list), "cohorts.create_lists", false, shared.data.id)).toEqual({ ok: true, data: null });
      expect(await getList(tx, lead, made.data.id)).toBeNull();
    });
  });

  it("a dynamic list inherits its filter's sensitivity and can't go to someone who can't see it", async () => {
    await withSeed(async (tx) => {
      const support = await as(tx, SUPPORT);
      const made = await createList(tx, support, {
        name: "IEP students, grade 7", kind: "dynamic",
        spec: { source: "students", filters: [{ field: "iep", op: "is_true" }, { field: "grade", op: "eq", value: 7 }] },
      });
      expect(made.ok).toBe(true);
      if (!made.ok) return;
      const found = await getList(tx, support, made.data.id);
      expect(found?.list.sensitivity).toBe("sensitive");
      expect((await listStudentIds(tx, support, found!.list)).length).toBeGreaterThan(0);

      const teacher = await as(tx, TEACHER);
      expect(await shareItem(tx, support, asShareable(found!.list), "cohorts.create_lists", false, { target: { userId: teacher.userId }, access: "view" }))
        .toMatchObject({ ok: false, error: expect.stringMatching(/can't see this for every student/) });
      const leader = await as(tx, LEADER);
      expect((await shareItem(tx, support, asShareable(found!.list), "cohorts.create_lists", false, { target: { userId: leader.userId }, access: "view" })).ok).toBe(true);
    });
  });

  it("a teacher can't make a list from a filter their role can't use", async () => {
    await withSeed(async (tx) => {
      const coach = await as(tx, COACH);
      expect(await createList(tx, coach, { name: "IEP", kind: "dynamic", spec: { source: "students", filters: [{ field: "iep", op: "is_true" }] } }))
        .toMatchObject({ ok: false });
    });
  });

  it("group shares reach members, and only members whose role may see it", async () => {
    await withSeed(async (tx) => {
      const teacher = await as(tx, TEACHER);
      const lead = await as(tx, GRADE_LEAD);
      const made = await createList(tx, teacher, { name: "Grade 7 tutoring", kind: "static", studentIds: [await studentIdByName(tx, "Camila", "Martinez")] });
      if (!made.ok) throw new Error(made.error);
      const group = "grade7@creoprep.org";
      expect(await shareItem(tx, teacher, asShareable((await getList(tx, teacher, made.data.id))!.list), "cohorts.create_lists", false, { target: { googleGroupEmail: group }, access: "view" }))
        .toMatchObject({ ok: false, error: expect.stringMatching(/no SIS staff members yet/) });
      await tx.insert(directoryGroupMembers).values({ schoolId: teacher.schoolId, createdBy: teacher.userId, googleGroupEmail: group, staffId: lead.staffId });
      expect((await shareItem(tx, teacher, asShareable((await getList(tx, teacher, made.data.id))!.list), "cohorts.create_lists", false, { target: { googleGroupEmail: group }, access: "view" })).ok).toBe(true);
      expect((await getList(tx, lead, made.data.id))?.access).toBe("view");
    });
  });
});
