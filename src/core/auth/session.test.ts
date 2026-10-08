import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { userIdByEmail, withSeed } from "../../../tests/helpers/db";
import { auditLog } from "../audit/schema";
import { getSql } from "../db/client";
import { staffRoles, sessions, staff } from "./schema";
import { createSession, revokeSession, SignInRefused, validateSession } from "./session";
import { hashSessionToken } from "./tokens";

afterAll(async () => {
  await getSql().end();
});

// Seeded test users (src/core/seed/personas.ts)
const TEACHER = "jordan.reyes@creoprep.org";
const DEAN = "luis.almonte@creoprep.org";
const NO_ROLE = "chris.lindqvist@creoprep.org";
const STUDENT = "camila.martinez.28@creoprep.org";
const FAMILY = "rosa.martinez@example.com";
const STAFF_PARENT_FAMILY = "gabriela.santos.home@example.com";

const NOW = new Date("2026-10-08T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SignInRefused) return error.reason;
    throw error;
  }
  throw new Error("Expected sign-in to be refused");
}

describe("sessions", () => {
  it("sign a teacher in, store only the token hash, and audit it", async () => {
    await withSeed(async (tx) => {
      const userId = await userIdByEmail(tx, TEACHER);
      const { token, viewer } = await createSession(tx, { userId, surface: "staff", method: "dev", now: NOW });
      expect(viewer).toMatchObject({ kind: "staff", roles: ["teacher"], hasAccess: true });

      const [row] = await tx.select().from(sessions).where(eq(sessions.userId, userId));
      expect(row?.tokenHash).toBe(hashSessionToken(token));
      expect(row?.tokenHash).not.toContain(token);

      const audit = await tx
        .select({ action: auditLog.action, via: auditLog.via })
        .from(auditLog)
        .where(eq(auditLog.actorUserId, userId));
      expect(audit).toEqual([{ action: "auth.sign_in", via: "dev" }]);

      expect(await validateSession(tx, token, "staff", NOW)).toMatchObject({ userId, roles: ["teacher"] });
    });
  });

  it("give a person with two roles both", async () => {
    await withSeed(async (tx) => {
      const userId = await userIdByEmail(tx, DEAN);
      const { viewer } = await createSession(tx, { userId, surface: "staff", method: "dev", now: NOW });
      expect(viewer).toMatchObject({ roles: ["support", "teacher"] });
    });
  });

  it("refuse staff with no role", async () => {
    await withSeed(async (tx) => {
      const userId = await userIdByEmail(tx, NO_ROLE);
      expect(await refusal(createSession(tx, { userId, surface: "staff", method: "dev", now: NOW }))).toBe("no_access");
    });
  });

  it("refuse a user on another surface", async () => {
    await withSeed(async (tx) => {
      const staffUser = await userIdByEmail(tx, TEACHER);
      const familyUser = await userIdByEmail(tx, FAMILY);
      expect(await refusal(createSession(tx, { userId: staffUser, surface: "family", method: "dev" }))).toBe(
        "wrong_surface",
      );
      expect(await refusal(createSession(tx, { userId: familyUser, surface: "staff", method: "dev" }))).toBe(
        "wrong_surface",
      );
    });
  });

  it("sign in a student and a family with two children", async () => {
    await withSeed(async (tx) => {
      const student = await createSession(tx, { userId: await userIdByEmail(tx, STUDENT), surface: "student", method: "dev", now: NOW });
      expect(student.viewer).toMatchObject({ kind: "student", hasAccess: true });
      // Student sessions end at 6 pm New York time.
      expect(student.expiresAt.toISOString()).toBe("2026-10-08T22:00:00.000Z");

      const family = await createSession(tx, { userId: await userIdByEmail(tx, FAMILY), surface: "family", method: "dev", now: NOW });
      expect(family.viewer).toMatchObject({ kind: "family", language: "es" });
      expect(family.viewer.kind === "family" && family.viewer.studentIds).toHaveLength(2);
      expect(family.viewer.kind === "family" && family.viewer.studentIds).toContain(
        student.viewer.kind === "student" ? student.viewer.studentId : "",
      );
    });
  });

  it("treat a staff member's personal family account as a separate identity", async () => {
    await withSeed(async (tx) => {
      const family = await createSession(tx, {
        userId: await userIdByEmail(tx, STAFF_PARENT_FAMILY), surface: "family", method: "dev", now: NOW,
      });
      expect(family.viewer).toMatchObject({ kind: "family", hasAccess: true });
      expect(await validateSession(tx, family.token, "staff", NOW)).toBeNull();
    });
  });

  it("reject a token on the wrong surface, after expiry, or after sign-out", async () => {
    await withSeed(async (tx) => {
      const userId = await userIdByEmail(tx, FAMILY);
      const { token } = await createSession(tx, { userId, surface: "family", method: "dev", now: NOW });
      expect(await validateSession(tx, token, "staff", NOW)).toBeNull();
      expect(await validateSession(tx, "not-a-real-token", "family", NOW)).toBeNull();
      expect(await validateSession(tx, token, "family", new Date(NOW.getTime() + 31 * DAY))).toBeNull();
      expect(await validateSession(tx, token, "family", NOW)).not.toBeNull();

      await revokeSession(tx, token, NOW);
      expect(await validateSession(tx, token, "family", NOW)).toBeNull();
      const actions = await tx.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.actorUserId, userId));
      expect(actions.map((a) => a.action)).toEqual(["auth.sign_in", "auth.sign_out"]);
    });
  });

  it("roll a staff session forward with activity", async () => {
    await withSeed(async (tx) => {
      const userId = await userIdByEmail(tx, TEACHER);
      const { token } = await createSession(tx, { userId, surface: "staff", method: "dev", now: NOW });
      expect(await validateSession(tx, token, "staff", new Date(NOW.getTime() + 6 * DAY))).not.toBeNull();
      // Twelve days after sign-in, still valid because of the activity on day six.
      expect(await validateSession(tx, token, "staff", new Date(NOW.getTime() + 12 * DAY))).not.toBeNull();
      // But not after a week of inactivity.
      expect(await validateSession(tx, token, "staff", new Date(NOW.getTime() + 20 * DAY))).toBeNull();
    });
  });

  it("drop a session as soon as the person loses their role", async () => {
    await withSeed(async (tx) => {
      const userId = await userIdByEmail(tx, TEACHER);
      const { token } = await createSession(tx, { userId, surface: "staff", method: "dev", now: NOW });
      const [person] = await tx.select({ id: staff.id }).from(staff).where(eq(staff.userId, userId));
      await tx
        .update(staffRoles)
        .set({ endsOn: "2026-08-31" })
        .where(and(eq(staffRoles.staffId, person!.id), eq(staffRoles.role, "teacher")));
      expect(await validateSession(tx, token, "staff", NOW)).toBeNull();
    });
  });
});
