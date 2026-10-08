import { sql } from "drizzle-orm";
import type { Db } from "../db/types";

// A database-level setting written by `pnpm db:seed`. It marks a database as
// holding synthetic data only. Dev sign-in refuses to run without it. Nothing
// ever sets it on staging or production.
const SETTING = "creo.synthetic_data";

export async function markDatabaseSynthetic(db: Db): Promise<void> {
  const [row] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  await db.execute(sql.raw(`ALTER DATABASE "${row!.name.replace(/"/g, '""')}" SET ${SETTING} = 'true'`));
}

/** True only on a database seeded by `pnpm db:seed`. Applies to new connections. */
export async function isDatabaseSynthetic(db: Pick<Db, "execute">): Promise<boolean> {
  const [row] = await db.execute<{ value: string | null }>(
    sql`select current_setting(${SETTING}, true) as value`,
  );
  return row?.value === "true";
}
