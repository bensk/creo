import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { bootstrapSchool, expectRejected, inRollback } from "../../../tests/helpers/db";
import { getSql } from "./client";

// Database-level rules from the approved Phase 0 schema. These run as creo_app.

afterAll(async () => {
  await getSql().end();
});

type Tx = postgres.TransactionSql;

async function studentAndGroup(tx: Tx) {
  const { schoolId, systemUserId: by } = await bootstrapSchool(tx);
  const [year] = await tx<{ id: string }[]>`
    insert into school_years (school_id, created_by, label, starts_on, ends_on)
    values (${schoolId}, ${by}, '2026–27', '2026-09-08', '2027-06-25') returning id`;
  const [student] = await tx<{ id: string }[]>`
    insert into students (school_id, created_by, legal_first_name, legal_last_name)
    values (${schoolId}, ${by}, 'Test', 'Student') returning id`;
  const [group] = await tx<{ id: string }[]>`
    insert into groups (school_id, created_by, school_year_id, type, name, grade_level)
    values (${schoolId}, ${by}, ${year!.id}, 'homeroom', 'Syracuse', 7) returning id`;
  return { schoolId, by, yearId: year!.id, studentId: student!.id, groupId: group!.id };
}

describe("effective-dated memberships", () => {
  it("reject overlapping periods for the same student and group", async () => {
    await inRollback(async (tx) => {
      const f = await studentAndGroup(tx);
      const add = (sp: Tx, starts: string, ends: string | null) => sp`
        insert into group_memberships (school_id, created_by, group_id, student_id, starts_on, ends_on)
        values (${f.schoolId}, ${f.by}, ${f.groupId}, ${f.studentId}, ${starts}, ${ends})`;

      await add(tx, "2026-09-08", "2026-10-31");
      expect(await expectRejected(tx, (sp) => add(sp, "2026-10-31", null))).toMatch(/no_overlap/);
      // The next day is fine: ends_on is the last day included.
      await add(tx, "2026-11-01", null);
    });
  });

  it("reject an ends_on before starts_on", async () => {
    await inRollback(async (tx) => {
      const f = await studentAndGroup(tx);
      const message = await expectRejected(tx, (sp) => sp`
        insert into group_memberships (school_id, created_by, group_id, student_id, starts_on, ends_on)
        values (${f.schoolId}, ${f.by}, ${f.groupId}, ${f.studentId}, '2026-10-01', '2026-09-30')`);
      expect(message).toMatch(/dates_check/);
    });
  });

  it("reject overlapping enrollments for one student", async () => {
    await inRollback(async (tx) => {
      const f = await studentAndGroup(tx);
      const enroll = (sp: Tx, entry: string, exit: string | null) => sp`
        insert into enrollments (school_id, created_by, student_id, school_year_id, grade_level, status, entry_date, exit_date)
        values (${f.schoolId}, ${f.by}, ${f.studentId}, ${f.yearId}, 7, 'active', ${entry}, ${exit})`;
      await enroll(tx, "2026-09-08", "2026-12-01");
      expect(await expectRejected(tx, (sp) => enroll(sp, "2026-11-15", null))).toMatch(/no_overlap/);
      await enroll(tx, "2027-01-04", null);
    });
  });
});

describe("contacts", () => {
  it.each(["parent@creoprep.org", "Parent@CreoPrep.org", "kid@students.creoprep.org"])(
    "reject a Creo email (%s)",
    async (email) => {
      await inRollback(async (tx) => {
        const { schoolId, systemUserId } = await bootstrapSchool(tx);
        const message = await expectRejected(tx, (sp) => sp`
          insert into contacts (school_id, created_by, first_name, last_name, email)
          values (${schoolId}, ${systemUserId}, 'A', 'Parent', ${email})`);
        expect(message).toMatch(/contacts_email_not_creo_check/);
      });
    },
  );

  it("accept a personal email", async () => {
    await inRollback(async (tx) => {
      const { schoolId, systemUserId } = await bootstrapSchool(tx);
      await tx`
        insert into contacts (school_id, created_by, first_name, last_name, email)
        values (${schoolId}, ${systemUserId}, 'A', 'Parent', 'parent@gmail.com')`;
    });
  });
});

describe("students", () => {
  it("reject an OSIS that is not nine digits", async () => {
    await inRollback(async (tx) => {
      const { schoolId, systemUserId } = await bootstrapSchool(tx);
      const message = await expectRejected(tx, (sp) => sp`
        insert into students (school_id, created_by, legal_first_name, legal_last_name, osis)
        values (${schoolId}, ${systemUserId}, 'A', 'B', '12345')`);
      expect(message).toMatch(/students_osis_check/);
    });
  });
});

describe("ai_grants", () => {
  it("require exactly one of role or user", async () => {
    await inRollback(async (tx) => {
      const { schoolId, systemUserId } = await bootstrapSchool(tx);
      const grant = (sp: Tx, role: string | null, userId: string | null) => sp`
        insert into ai_grants (school_id, created_by, role, user_id, effect)
        values (${schoolId}, ${systemUserId}, ${role}, ${userId}, 'grant')`;
      expect(await expectRejected(tx, (sp) => grant(sp, null, null))).toMatch(/target_check/);
      expect(await expectRejected(tx, (sp) => grant(sp, "leader", systemUserId))).toMatch(/target_check/);
      expect(await expectRejected(tx, (sp) => grant(sp, "student", null))).toMatch(/role_check/);
      await grant(tx, "leader", null);
    });
  });
});

describe("audit_log", () => {
  it("is append-only for the app role", async () => {
    await inRollback(async (tx) => {
      const { schoolId, systemUserId } = await bootstrapSchool(tx);
      await tx`
        insert into audit_log (school_id, actor_user_id, action, entity, via)
        values (${schoolId}, ${systemUserId}, 'test.write', 'test', 'system')`;
      expect(await expectRejected(tx, (sp) => sp`update audit_log set action = 'changed'`)).toMatch(
        /permission denied/,
      );
      expect(await expectRejected(tx, (sp) => sp`delete from audit_log`)).toMatch(/permission denied/);
      expect(await expectRejected(tx, (sp) => sp`truncate audit_log`)).toMatch(/permission denied/);
    });
  });

  it("is append-only even for the owner", async () => {
    const ownerUrl =
      process.env.TEST_MIGRATION_DATABASE_URL ?? "postgres://creo:creo@localhost:5432/creo_test";
    const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} });
    try {
      await inRollback(async (tx) => {
        const { schoolId, systemUserId } = await bootstrapSchool(tx);
        await tx`
          insert into audit_log (school_id, actor_user_id, action, entity, via)
          values (${schoolId}, ${systemUserId}, 'test.write', 'test', 'system')`;
        await tx`
          insert into sensitive_reads (school_id, actor_user_id, entity, field, via)
          values (${schoolId}, ${systemUserId}, 'students', 'osis', 'system')`;
        for (const statement of [
          (sp: Tx) => sp`update audit_log set action = 'changed'`,
          (sp: Tx) => sp`delete from audit_log`,
          (sp: Tx) => sp`truncate audit_log`,
          (sp: Tx) => sp`update sensitive_reads set field = 'x'`,
          (sp: Tx) => sp`delete from sensitive_reads`,
        ]) {
          expect(await expectRejected(tx, statement)).toMatch(/append-only/);
        }
      }, owner);
    } finally {
      await owner.end();
    }
  });
});
