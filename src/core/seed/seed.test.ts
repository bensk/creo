import { getTableName, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../db/client";
import { isDatabaseSynthetic } from "../db/synthetic";
import { buildSeed } from "./build";
import { HOMEROOMS } from "./names";
import { ALL_PERSONAS, STAFF_PERSONAS, STUDENT_PERSONA } from "./personas";
import { writeSeed } from "./write";

afterAll(async () => {
  await getSql().end();
});

const batches = buildSeed();
const rowsOf = (table: string) =>
  batches.filter((b) => getTableName(b.table) === table).flatMap((b) => b.rows) as Record<string, unknown>[];

describe("seed data", () => {
  it("is identical on every run, including ids", () => {
    expect(buildSeed()).toEqual(batches);
    expect(buildSeed(1)).not.toEqual(batches);
  });

  it("has four homerooms per grade and 25 seats each", () => {
    expect(rowsOf("students")).toHaveLength(16 * 25);
    expect(rowsOf("groups").filter((g) => g.type === "homeroom")).toHaveLength(16);
  });

  it("includes every test user", () => {
    const staffEmails = new Set(rowsOf("staff").map((s) => `${s.givenName} ${s.familyName}`));
    for (const p of STAFF_PERSONAS) expect(staffEmails).toContain(`${p.givenName} ${p.familyName}`);
    expect(rowsOf("students").some((s) => s.preferredFirstName === STUDENT_PERSONA.preferredFirstName)).toBe(true);
    const contactEmails = new Set(rowsOf("contacts").map((c) => c.email));
    for (const p of ALL_PERSONAS) if (p.kind === "family") expect(contactEmails).toContain(p.email);
  });

  it("gives the no-role test user no roles", () => {
    const noRole = rowsOf("staff").find((s) => s.givenName === "Chris" && s.familyName === "Lindqvist");
    expect(rowsOf("staff_roles").filter((r) => r.staffId === noRole?.id)).toEqual([]);
  });

  it("gives every homeroom a homeroom teacher and every grade team one lead", () => {
    const staffRows = rowsOf("group_staff");
    for (const g of rowsOf("groups")) {
      const fn = g.type === "homeroom" ? "homeroom_teacher" : "lead";
      expect(staffRows.filter((s) => s.groupId === g.id && s.function === fn), String(g.name)).toHaveLength(1);
    }
    expect(Object.values(HOMEROOMS).flat()).toContain(STUDENT_PERSONA.homeroom);
  });

  it("uses only synthetic identifiers", () => {
    const osis = rowsOf("students").map((s) => s.osis as string);
    expect(new Set(osis).size).toBe(osis.length);
    for (const o of osis) expect(o).toMatch(/^999\d{6}$/);
    for (const c of rowsOf("contacts")) {
      if (c.email) expect(c.email).toMatch(/@example\.(com|net|org)$/);
      expect(c.phonePrimary).toMatch(/555-01\d\d$/);
    }
  });

  it("satisfies every database constraint", async () => {
    // Written as creo_app inside a transaction that is rolled back.
    let written = 0;
    await getDb()
      .transaction(async (tx) => {
        await writeSeed(tx, batches);
        const [row] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from students`);
        written = row?.n ?? 0;
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.message === "Rollback")) throw error;
      });
    expect(written).toBeGreaterThanOrEqual(400);
  });
});

describe("synthetic-data marker", () => {
  it("is absent on an unseeded database and readable when set", async () => {
    const db = getDb();
    expect(await isDatabaseSynthetic(db)).toBe(false);
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`set local creo.synthetic_data = 'true'`);
      expect(await isDatabaseSynthetic(tx)).toBe(true);
    });
  });
});
