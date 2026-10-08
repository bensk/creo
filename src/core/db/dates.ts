import { and, gte, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { schools } from "../identity/schema";

/**
 * Today's date in the school's time zone. Queries using it must join `schools`
 * on the row's school_id.
 */
export const schoolToday: SQL = sql`(now() at time zone ${schools.timezone})::date`;

/** An effective-dated row (starts_on .. ends_on, inclusive; null = ongoing) that covers today. */
export function currentOn(startsOn: PgColumn, endsOn: PgColumn): SQL {
  return and(lte(startsOn, schoolToday), or(isNull(endsOn), gte(endsOn, schoolToday)))!;
}
