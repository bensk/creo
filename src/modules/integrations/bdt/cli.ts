import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertRealDataDatabase } from "@/core/db/local-guard";
import { isDatabaseSynthetic } from "@/core/db/synthetic";
import { schools } from "@/core/identity/schema";
import { notionDataSource } from "../notion/client";
import { importBigDataTracker } from "./import";

// `pnpm import:bdt`: nightly Cloud Run job (see infra/), or by hand against production.
// Needs DATABASE_URL, NOTION_TOKEN (read-only integration), NOTION_BDT_DATA_SOURCE_ID.
// Prints counts and row-numbered problems only, never student details.
async function main(): Promise<void> {
  const { DATABASE_URL: url, NOTION_TOKEN: token, NOTION_BDT_DATA_SOURCE_ID: dataSourceId } = process.env;
  if (!url || !token || !dataSourceId) throw new Error("Set DATABASE_URL, NOTION_TOKEN, and NOTION_BDT_DATA_SOURCE_ID.");
  const dbn = process.env.SCHOOL_DBN ?? "84X612";

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(sql);
    assertRealDataDatabase(url, "import the Big Data Tracker", await isDatabaseSynthetic(db));
    const [school] = await db.select({ id: schools.id, timezone: schools.timezone }).from(schools).where(eq(schools.dbn, dbn));
    if (!school) throw new Error(`No school with DBN ${dbn}.`);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: school.timezone }).format(new Date());
    const result = await importBigDataTracker(db, notionDataSource({ token, dataSourceId }), { schoolId: school.id, today });
    console.log(JSON.stringify({ job: "import.big_data_tracker", today, runId: result.runId, ...result.counts }));
    for (const e of result.errors) console.log(e);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
