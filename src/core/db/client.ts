import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/core/env";

type Db = ReturnType<typeof drizzle>;

// Reuse one pool across dev hot reloads instead of opening a new one per edit.
const globalForDb = globalThis as unknown as { creoSql?: postgres.Sql; creoDb?: Db };

export function getSql(): postgres.Sql {
  // Per instance. Cloud Run runs up to 10 instances, so keep max × instances under
  // Cloud SQL's connection limit.
  globalForDb.creoSql ??= postgres(serverEnv().DATABASE_URL, { max: serverEnv().DB_POOL_MAX });
  return globalForDb.creoSql;
}

export function getDb(): Db {
  globalForDb.creoDb ??= drizzle(getSql());
  return globalForDb.creoDb;
}
