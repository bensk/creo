import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Vitest global setup: rebuild the test database from the migrations, as the
// owner, before any test runs. Tests then connect as creo_app, so database
// permissions are exercised exactly as in production.
export default async function setup(): Promise<void> {
  const ownerUrl =
    process.env.TEST_MIGRATION_DATABASE_URL ?? "postgres://creo:creo@localhost:5432/creo_test";
  if (!new URL(ownerUrl).pathname.endsWith("_test")) {
    throw new Error("Refusing to reset a database whose name does not end in _test");
  }
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    // CI's Postgres service has no init scripts, so make sure the app role exists.
    await sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'creo_app') THEN
          CREATE ROLE creo_app LOGIN PASSWORD 'creo_app';
        END IF;
      END $$;
    `);
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
    `);
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  } finally {
    await sql.end();
  }
}
