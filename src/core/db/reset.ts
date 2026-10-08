import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type postgres from "postgres";
import { assertLocalDatabase } from "./local-guard";

/**
 * Drops every table and re-applies the migrations. Local databases only; must be
 * run as the owner. This is the only way to clear audit_log, which is
 * append-only even for the owner.
 */
export async function resetLocalDatabase(sql: postgres.Sql, url: string): Promise<void> {
  assertLocalDatabase(url, "reset the database");
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
}
