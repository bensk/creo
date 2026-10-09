import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { viewerFor, withSeed } from "../../../tests/helpers/db";
import { auditLog } from "../audit/schema";
import { getSql } from "../db/client";
import { AiAdminError, grantAi, listAi, operatorByEmail, parseFeatures, parseRole, revokeAi } from "./admin";
import { isEnabledFor } from "./grants";

afterAll(async () => {
  await getSql().end();
});

const ON = { switchedOn: true, configured: true };
const OPERATOR = "marisol.pena@creoprep.org";
const LEADER = "marisol.pena@creoprep.org";
const TEACHER = "jordan.reyes@creoprep.org";

describe("ai admin", () => {
  it("grants a role, then revokes it for one person, then lifts that revoke", async () => {
    await withSeed(async (tx) => {
      const op = await operatorByEmail(tx, OPERATOR);
      await grantAi(tx, op, { role: "teacher" }, null, "pilot");
      expect(await isEnabledFor(tx, await viewerFor(tx, TEACHER), "trackers.suggest", ON)).toBe(true);

      await revokeAi(tx, op, { email: TEACHER }, null);
      expect(await isEnabledFor(tx, await viewerFor(tx, TEACHER), "trackers.suggest", ON)).toBe(false);

      await grantAi(tx, op, { email: TEACHER }, null);
      expect(await isEnabledFor(tx, await viewerFor(tx, TEACHER), "trackers.suggest", ON)).toBe(true);

      const rows = await listAi(tx, op);
      expect(rows.map((r) => [r.target, r.effect])).toEqual([["teacher", "grant"], [TEACHER, "grant"]]);
      const audit = await tx.select({ action: auditLog.action, via: auditLog.via }).from(auditLog).where(eq(auditLog.via, "cli"));
      expect(audit.map((a) => a.action)).toEqual(["ai.grant", "ai.revoke", "ai.grant"]);
    });
  });

  it("revoking a role ends its grants", async () => {
    await withSeed(async (tx) => {
      const op = await operatorByEmail(tx, OPERATOR);
      await grantAi(tx, op, { role: "leader" }, parseFeatures(["dashboards.widget"]));
      await revokeAi(tx, op, { role: "leader" }, null);
      expect(await isEnabledFor(tx, await viewerFor(tx, LEADER), "dashboards.widget", ON)).toBe(false);
      expect(await listAi(tx, op)).toEqual([]);
    });
  });

  it("refuses students, families, unknown roles, and unknown features", async () => {
    await withSeed(async (tx) => {
      const op = await operatorByEmail(tx, OPERATOR);
      await expect(grantAi(tx, op, { email: "camila.martinez.28@creoprep.org" }, null)).rejects.toThrow(/students or families/);
      await expect(grantAi(tx, op, { email: "rosa.martinez@example.com" }, null)).rejects.toThrow(/students or families/);
      expect(() => parseRole("student")).toThrow(AiAdminError);
      expect(() => parseFeatures(["write.everything"])).toThrow(/Unknown AI feature/);
      await expect(operatorByEmail(tx, "rosa.martinez@example.com")).rejects.toThrow(/not an active staff user/);
    });
  });
});
