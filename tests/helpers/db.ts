import postgres from "postgres";
import { getDb, getSql } from "@/core/db/client";
import type { Db } from "@/core/db/types";

type Tx = postgres.TransactionSql;

class Rollback extends Error {}

/** Runs fn in a transaction that is always rolled back, so tests leave no rows behind. */
export async function inRollback(
  fn: (tx: Tx) => Promise<void>,
  sql: postgres.Sql = getSql(),
): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/** Expects one statement to fail, without aborting the surrounding transaction. */
export async function expectRejected(tx: Tx, statement: (sp: Tx) => Promise<unknown>): Promise<string> {
  try {
    await tx.savepoint(statement);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected the statement to be rejected, but it succeeded");
}

/** A school plus the system user that creates everything else. */
export async function bootstrapSchool(tx: Tx) {
  const [school] = await tx<{ id: string }[]>`
    insert into schools (name, dbn) values ('Test School', ${`T${Math.random().toString().slice(2, 8)}`})
    returning id`;
  const systemUserId = crypto.randomUUID();
  await tx`
    insert into users (id, school_id, created_by, kind, display_name)
    values (${systemUserId}, ${school!.id}, ${systemUserId}, 'system', 'test')`;
  return { schoolId: school!.id, systemUserId };
}

class SeededRollback extends Error {}

/**
 * Writes the full synthetic seed inside a transaction (as creo_app), runs fn,
 * then rolls everything back. Use for tests that need realistic people.
 */
export async function withSeed(fn: (tx: Db) => Promise<void>): Promise<void> {
  const { buildSeed } = await import("@/core/seed/build");
  const { writeSeed } = await import("@/core/seed/write");
  try {
    await getDb().transaction(async (tx) => {
      await writeSeed(tx, buildSeed());
      await fn(tx);
      throw new SeededRollback();
    });
  } catch (error) {
    if (!(error instanceof SeededRollback)) throw error;
  }
}

/** The users.id for a seeded login email. */
export async function userIdByEmail(tx: Db, email: string): Promise<string> {
  const { users } = await import("@/core/identity/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!row) throw new Error(`No seeded user with email ${email}`);
  return row.id;
}

/** Signs a seeded user in (dev method) inside the transaction and returns their viewer. */
export async function viewerFor(tx: Db, email: string, surface: "staff" | "student" | "family" = "staff") {
  const { createSession } = await import("@/core/auth/session");
  const { viewer } = await createSession(tx, { userId: await userIdByEmail(tx, email), surface, method: "dev" });
  return viewer;
}

/** A seeded student's id by preferred-or-legal first name and last name. */
export async function studentIdByName(tx: Db, firstName: string, lastName: string): Promise<string> {
  const { students } = await import("@/modules/students/schema");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.legalFirstName, firstName), eq(students.legalLastName, lastName)));
  if (!row) throw new Error(`No seeded student ${firstName} ${lastName}`);
  return row.id;
}
