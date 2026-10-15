import { and, eq, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { fakeDirectory } from "../../../tests/helpers/fake-directory";
import { withSeed } from "../../../tests/helpers/db";
import { auditLog } from "../audit/schema";
import { directoryGroupMembers, staff, staffRoles } from "../auth/schema";
import { getSql } from "../db/client";
import type { Db } from "../db/types";
import { schools, users } from "../identity/schema";
import { syncStaffFromDirectory } from "./sync";

afterAll(async () => {
  await getSql().end();
});

const TODAY = "2026-10-08";

async function rolesOf(tx: Db, email: string) {
  const rows = await tx
    .select({ role: staffRoles.role, source: staffRoles.source, endsOn: staffRoles.endsOn })
    .from(staffRoles)
    .innerJoin(staff, eq(staff.id, staffRoles.staffId))
    .where(and(eq(staff.email, email), isNull(staffRoles.endsOn)));
  return rows.map((r) => `${r.role}:${r.source}`).sort();
}

async function schoolId(tx: Db) {
  const [s] = await tx.select({ id: schools.id }).from(schools);
  return s!.id;
}

// The Directory as Google would report it after some changes at school.
const directory = () =>
  fakeDirectory(
    [
      { email: "jordan.reyes@creoprep.org", id: "g-jordan", givenName: "Jordan", familyName: "Reyes" },
      { email: "marisol.pena@creoprep.org", id: "g-marisol", givenName: "Marisol", familyName: "Peña" },
      { email: "yesenia.cruz@creoprep.org", id: "g-yesenia", givenName: "Yesenia", familyName: "Cruz", suspended: true },
      { email: "dana.whitfield@creoprep.org", id: "g-dana", givenName: "Dana", familyName: "Whitfield" },
      { email: "new.hire@creoprep.org", id: "g-new", givenName: "Nia", familyName: "Okafor" },
      { email: "camila.martinez.28@creoprep.org", id: "g-cami", orgUnitPath: "/Students/Class of 2028" },
    ],
    {
      "teachers@creoprep.org": ["jordan.reyes@creoprep.org", "new.hire@creoprep.org", "camila.martinez.28@creoprep.org"],
      // Marisol is no longer in leadership@; Yesenia is still in operations@ but suspended.
      "operations@creoprep.org": ["yesenia.cruz@creoprep.org"],
    },
  );

describe("syncStaffFromDirectory", () => {
  it("creates new staff, follows group changes, deactivates suspended accounts, and leaves manual roles alone", async () => {
    await withSeed(async (tx) => {
      const summary = await syncStaffFromDirectory(tx, directory(), { schoolId: await schoolId(tx), today: TODAY });

      expect(await rolesOf(tx, "new.hire@creoprep.org")).toEqual(["teacher:directory"]);
      expect(await rolesOf(tx, "jordan.reyes@creoprep.org")).toEqual(["teacher:directory"]);
      expect(await rolesOf(tx, "marisol.pena@creoprep.org")).toEqual([]); // left leadership@
      expect(await rolesOf(tx, "yesenia.cruz@creoprep.org")).toEqual([]); // suspended
      expect(await rolesOf(tx, "dana.whitfield@creoprep.org")).toEqual(["admin:manual"]); // manual, untouched

      const [yesenia] = await tx.select({ status: users.status }).from(users).where(eq(users.email, "yesenia.cruz@creoprep.org"));
      expect(yesenia?.status).toBe("disabled");
      // Students are never made staff, even if they end up in a staff group.
      expect(await tx.select().from(staff).where(eq(staff.email, "camila.martinez.28@creoprep.org"))).toEqual([]);
      // Seeded staff the sync has never seen (no directory record) are left alone.
      const [luis] = await tx.select({ status: staff.status }).from(staff).where(eq(staff.email, "luis.almonte@creoprep.org"));
      expect(luis?.status).toBe("active");

      expect(summary).toMatchObject({ created: 1, deactivated: 1, rolesAdded: 1, rolesEnded: 2 });
      const audited = await tx.select({ action: auditLog.action, via: auditLog.via }).from(auditLog).where(eq(auditLog.via, "system"));
      expect(audited.map((a) => a.action).sort()).toEqual(
        expect.arrayContaining(["staff.create", "staff.deactivate", "staff_role.add", "staff_role.end"]),
      );
    });
  });

  it("changes nothing the second time", async () => {
    await withSeed(async (tx) => {
      const id = await schoolId(tx);
      await syncStaffFromDirectory(tx, directory(), { schoolId: id, today: TODAY });
      expect(await syncStaffFromDirectory(tx, directory(), { schoolId: id, today: TODAY })).toEqual({
        created: 0, updated: 0, deactivated: 0, rolesAdded: 0, rolesEnded: 0, groupsRefreshed: expect.any(Number),
      });
    });
  });

  it("stores who is in each group that roles map from, for group shares", async () => {
    await withSeed(async (tx) => {
      await syncStaffFromDirectory(tx, directory(), { schoolId: await schoolId(tx), today: TODAY });
      const members = await tx.select({ email: staff.email }).from(directoryGroupMembers)
        .innerJoin(staff, eq(staff.id, directoryGroupMembers.staffId))
        .where(eq(directoryGroupMembers.googleGroupEmail, "teachers@creoprep.org"));
      // Staff only: the student account in the group isn't stored.
      expect(members.map((m) => m.email).sort()).toEqual(["jordan.reyes@creoprep.org", "new.hire@creoprep.org"]);
    });
  });

  it("deactivates previously synced staff who disappear from the Directory", async () => {
    await withSeed(async (tx) => {
      const id = await schoolId(tx);
      await syncStaffFromDirectory(tx, directory(), { schoolId: id, today: TODAY });
      const without = fakeDirectory([{ email: "jordan.reyes@creoprep.org", id: "g-jordan", givenName: "Jordan", familyName: "Reyes" }], {
        "teachers@creoprep.org": ["jordan.reyes@creoprep.org"],
      });
      const summary = await syncStaffFromDirectory(tx, without, { schoolId: id, today: "2026-10-09" });
      expect(summary.deactivated).toBeGreaterThanOrEqual(2); // the new hire and Marisol
      const [hire] = await tx.select({ status: staff.status }).from(staff).where(eq(staff.email, "new.hire@creoprep.org"));
      expect(hire?.status).toBe("inactive");
      expect(await rolesOf(tx, "new.hire@creoprep.org")).toEqual([]);
    });
  });
});
