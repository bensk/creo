import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schools } from "@/core/identity/schema";
import { remindNotTaken } from "./remind";

// `pnpm attendance:remind`: a Cloud Run job started by Cloud Scheduler each
// school morning (see infra/). Needs DATABASE_URL and the Slack settings.
// Logs counts only.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL.");
  const dbn = process.env.SCHOOL_DBN ?? "84X612";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(sql);
    const [school] = await db.select({ id: schools.id, timezone: schools.timezone }).from(schools).where(eq(schools.dbn, dbn));
    if (!school) throw new Error(`No school with DBN ${dbn}.`);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: school.timezone }).format(new Date());
    console.log(JSON.stringify({ job: "attendance.remind", today, ...(await remindNotTaken(db, school.id, today)) }));
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
