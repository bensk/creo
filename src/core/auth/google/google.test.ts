import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { fakeDirectory } from "../../../../tests/helpers/fake-directory";
import { withSeed } from "../../../../tests/helpers/db";
import { auditLog } from "../../audit/schema";
import { getSql } from "../../db/client";
import { isStudentOrgUnit, withUserCache } from "../../google/directory";
import { staff } from "../schema";
import { newFlowState, parseFlowCookie, serializeFlowCookie, verifyCallback, type IdTokenClaims } from "./flow";
import { resolveGoogleUser } from "./resolve";

afterAll(async () => {
  await getSql().end();
});

const CONFIG = { domain: "creoprep.org" };
const TEACHER = "jordan.reyes@creoprep.org";
const STUDENT = "camila.martinez.28@creoprep.org";

function depsReturning(claims: Partial<IdTokenClaims>) {
  const seen: { code?: string; verifier?: string } = {};
  return {
    seen,
    deps: {
      exchange: async (code: string, verifier: string) => {
        seen.code = code;
        seen.verifier = verifier;
        return "id-token";
      },
      verify: async () => ({ sub: "google-123", ...claims }) as IdTokenClaims,
    },
  };
}

describe("verifyCallback", () => {
  const flow = newFlowState("staff", "verifier-abc");
  const good = { email: TEACHER, email_verified: true, hd: "creoprep.org", nonce: flow.nonce };

  it("accepts a verified Creo account and uses the PKCE verifier", async () => {
    const { deps, seen } = depsReturning(good);
    const result = await verifyCallback({ code: "c", state: flow.state }, flow, CONFIG, deps);
    expect(result).toEqual({ ok: true, email: TEACHER, sub: "google-123", surface: "staff" });
    expect(seen).toEqual({ code: "c", verifier: "verifier-abc" });
  });

  it.each([
    ["a missing flow cookie", { code: "c", state: flow.state }, null, good, "expired"],
    ["a cancelled sign-in", { error: "access_denied", state: flow.state }, flow, good, "cancelled"],
    ["a forged state", { code: "c", state: "other" }, flow, good, "state_mismatch"],
    ["a replayed token (nonce)", { code: "c", state: flow.state }, flow, { ...good, nonce: "x" }, "nonce_mismatch"],
    ["a personal Gmail account", { code: "c", state: flow.state }, flow, { ...good, hd: undefined, email: "someone@gmail.com" }, "wrong_domain"],
    ["another Workspace", { code: "c", state: flow.state }, flow, { ...good, hd: "evil.org", email: "x@evil.org" }, "wrong_domain"],
    ["hd claim without matching email", { code: "c", state: flow.state }, flow, { ...good, email: "x@evil.org" }, "wrong_domain"],
    ["an unverified email", { code: "c", state: flow.state }, flow, { ...good, email_verified: false }, "unverified_email"],
  ] as const)("refuses %s", async (_, params, f, claims, reason) => {
    const result = await verifyCallback(params, f, CONFIG, depsReturning(claims).deps);
    expect(result).toEqual({ ok: false, reason });
  });

  it("round-trips the flow cookie and rejects junk", () => {
    expect(parseFlowCookie(serializeFlowCookie(flow))).toEqual(flow);
    expect(parseFlowCookie("not-base64-json")).toBeNull();
    expect(parseFlowCookie(serializeFlowCookie({ ...flow, surface: "family" as never }))).toBeNull();
  });
});

describe("resolveGoogleUser", () => {
  it("signs in an existing staff member and pins their Google account on first use", async () => {
    await withSeed(async (tx) => {
      const first = await resolveGoogleUser(tx, { email: TEACHER, sub: "g-jordan" }, "staff", null);
      expect(first.ok).toBe(true);
      const [row] = await tx.select({ googleUserId: staff.googleUserId }).from(staff).where(eq(staff.email, TEACHER));
      expect(row?.googleUserId).toBe("g-jordan");
      expect(await tx.select().from(auditLog).where(eq(auditLog.action, "staff.link_google_account"))).toHaveLength(1);

      // A different Google account claiming the same email is refused.
      expect(await resolveGoogleUser(tx, { email: TEACHER, sub: "g-impostor" }, "staff", null)).toEqual({ ok: false, reason: "account_mismatch" });
    });
  });

  it("never creates accounts", async () => {
    await withSeed(async (tx) => {
      expect(await resolveGoogleUser(tx, { email: "new.hire@creoprep.org", sub: "g-new" }, "staff", null)).toEqual({ ok: false, reason: "no_account" });
      // A student's account on the staff side, and a staff account on the student side.
      expect(await resolveGoogleUser(tx, { email: STUDENT, sub: "g-cami" }, "staff", null)).toEqual({ ok: false, reason: "no_account" });
      expect(await resolveGoogleUser(tx, { email: TEACHER, sub: "g-jordan" }, "student", fakeDirectory())).toEqual({ ok: false, reason: "no_account" });
    });
  });

  it("requires students to be in the /students OU, checked in the Directory", async () => {
    await withSeed(async (tx) => {
      const inOu = fakeDirectory([{ email: STUDENT, id: "g-cami", orgUnitPath: "/Students/Class of 2028" }]);
      expect(await resolveGoogleUser(tx, { email: STUDENT, sub: "g-cami" }, "student", inOu)).toMatchObject({ ok: true });

      const elsewhere = fakeDirectory([{ email: STUDENT, id: "g-cami", orgUnitPath: "/Staff" }]);
      expect(await resolveGoogleUser(tx, { email: STUDENT, sub: "g-cami" }, "student", elsewhere)).toEqual({ ok: false, reason: "not_student_account" });

      const suspended = fakeDirectory([{ email: STUDENT, id: "g-cami", orgUnitPath: "/Students", suspended: true }]);
      expect(await resolveGoogleUser(tx, { email: STUDENT, sub: "g-cami" }, "student", suspended)).toEqual({ ok: false, reason: "not_student_account" });

      const otherAccount = fakeDirectory([{ email: STUDENT, id: "g-someone-else", orgUnitPath: "/Students" }]);
      expect(await resolveGoogleUser(tx, { email: STUDENT, sub: "g-cami" }, "student", otherAccount)).toEqual({ ok: false, reason: "not_student_account" });

      expect(await resolveGoogleUser(tx, { email: STUDENT, sub: "g-cami" }, "student", null)).toEqual({ ok: false, reason: "directory_unavailable" });
    });
  });
});

describe("directory helpers", () => {
  it("recognizes the students OU and its graduation-year sub-OUs only", () => {
    expect(isStudentOrgUnit("/Students")).toBe(true);
    expect(isStudentOrgUnit("/students/Class of 2030")).toBe(true);
    expect(isStudentOrgUnit("/StudentsArchive")).toBe(false);
    expect(isStudentOrgUnit("/Staff/Students Support")).toBe(false);
  });

  it("caches Directory lookups", async () => {
    const directory = fakeDirectory([{ email: STUDENT }]);
    const cached = withUserCache(directory);
    await cached.getUser(STUDENT);
    await cached.getUser(STUDENT.toUpperCase());
    expect(directory.calls()).toBe(1);
  });
});
