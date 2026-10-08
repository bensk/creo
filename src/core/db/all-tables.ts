import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { registry } from "@/modules";
import * as coreSchema from "./schema";

/** Every table in the app: core tables plus each registered module's tables. */
export function allTables(): PgTable[] {
  const exports = [
    ...Object.values(coreSchema),
    ...registry.modules.flatMap((m) => Object.values(m.schema ?? {})),
  ];
  return exports.filter((value): value is PgTable => is(value, PgTable));
}
