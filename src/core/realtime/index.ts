import { sql } from "drizzle-orm";
import type { Db } from "../db/types";

// Live updates between people on collaborative screens (CLAUDE.md:
// Server-Sent Events fed by Postgres LISTEN/NOTIFY). A change sends a small
// notice — what changed and who changed it, never the values — on one
// channel. Each open page's event stream checks the notice is for its item;
// the page then re-reads what changed with the viewer's own permissions.

export const CHANNEL = "creo_changes";

export interface ChangeNotice {
  kind: "tracker";
  id: string;
  /** Rows whose values changed; empty when the shape changed (columns, who's on it). */
  rowIds: string[];
  /** The user who made the change, so their own page can skip it. */
  by: string;
}

/** Sends a notice. Inside a transaction it's delivered on commit, or not at all. */
export async function notifyChange(db: Db, notice: ChangeNotice): Promise<void> {
  await db.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(notice)})`);
}
