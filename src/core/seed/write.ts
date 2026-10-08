import type { SeedBatch, SeedDb } from "./types";

const CHUNK = 500;

export async function writeSeed(db: SeedDb, batches: readonly SeedBatch[]): Promise<void> {
  for (const { table, rows } of batches) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(table).values(rows.slice(i, i + CHUNK));
    }
  }
}
