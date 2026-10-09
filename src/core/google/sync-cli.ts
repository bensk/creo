import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schools } from "../identity/schema";
import { directoryFromEnv } from "./directory";
import { linkStudentAccounts } from "./student-accounts";
import { syncStaffFromDirectory, syncUserIdFor } from "./sync";

// `pnpm directory:sync`: run nightly as a Cloud Run job (see infra/), or by hand.
// Needs DATABASE_URL, GOOGLE_DIRECTORY_CREDENTIALS, GOOGLE_DIRECTORY_ADMIN.
// Logs counts only, never names or emails.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL.");
  const directory = directoryFromEnv();
  if (!directory) throw new Error("Set GOOGLE_DIRECTORY_CREDENTIALS and GOOGLE_DIRECTORY_ADMIN.");
  const dbn = process.env.SCHOOL_DBN ?? "84X612";

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(sql);
    const [school] = await db.select({ id: schools.id, timezone: schools.timezone }).from(schools).where(eq(schools.dbn, dbn));
    if (!school) throw new Error(`No school with DBN ${dbn}.`);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: school.timezone }).format(new Date()); // YYYY-MM-DD
    const summary = await db.transaction((tx) => syncStaffFromDirectory(tx, directory, { schoolId: school.id, today }));
    console.log(JSON.stringify({ job: "directory.sync", today, ...summary }));
    const students = await db.transaction(async (tx) =>
      linkStudentAccounts(tx, directory, { schoolId: school.id, actorUserId: await syncUserIdFor(tx, school.id), today }),
    );
    // Counts only: unmatched and ambiguous accounts are for ops to review, never logged by name.
    console.log(JSON.stringify({ job: "directory.student_accounts", today, ...students }));
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
