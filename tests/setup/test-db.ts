import postgres from "postgres";
import { resetLocalDatabase } from "../../src/core/db/reset";

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
    await resetLocalDatabase(sql, ownerUrl);
  } finally {
    await sql.end();
  }
}
