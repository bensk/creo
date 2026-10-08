import postgres from "postgres";
import { getSql } from "@/core/db/client";

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
