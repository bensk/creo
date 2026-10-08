import { getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertLocalDatabase } from "../db/local-guard";
import { resetLocalDatabase } from "../db/reset";
import { markDatabaseSynthetic } from "../db/synthetic";
import { buildSeed } from "./build";
import { writeSeed } from "./write";

// `pnpm db:seed`: wipes the LOCAL dev database and loads synthetic data.
// Refuses to run against anything that isn't on this machine.
async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL ?? "postgres://creo:creo@localhost:5432/creo_dev";
  assertLocalDatabase(url, "seed the database");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await resetLocalDatabase(sql, url);
    const batches = buildSeed();
    const db = drizzle(sql);
    await db.transaction(async (tx) => {
      await writeSeed(tx, batches);
      await markDatabaseSynthetic(tx);
    });

    const counts = new Map<string, number>();
    for (const { table, rows } of batches) {
      const name = getTableName(table);
      counts.set(name, (counts.get(name) ?? 0) + rows.length);
    }
    console.log("Seeded synthetic data:");
    for (const [name, count] of counts) console.log(`  ${name.padEnd(20)} ${count}`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
