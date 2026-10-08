import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

/** A database handle or a transaction. Functions that write take one of these so callers control the transaction. */
export type Db = PgDatabase<PostgresJsQueryResultHKT, Record<string, unknown>>;
