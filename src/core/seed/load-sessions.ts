import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createSession } from "../auth/session";
import { assertLocalDatabase } from "../db/local-guard";
import { isDatabaseSynthetic } from "../db/synthetic";
import { users } from "../identity/schema";

// `pnpm load:sessions --out data/load-sessions.json [--students 450] [--staff 50]`
// Creates real sessions for seeded users so k6 can act as hundreds of signed-in
// people at once (Google sign-in can't be scripted). Synthetic databases only:
// the same name rules as the seed, plus the creo.synthetic_data marker.
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { out: { type: "string" }, students: { type: "string" }, staff: { type: "string" } },
  });
  if (!values.out) throw new Error("Pass --out <file> (keep it under data/, which git ignores).");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL.");
  assertLocalDatabase(url, "create load-test sessions");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(sql);
    if (!(await isDatabaseSynthetic(db))) throw new Error("This database isn't marked synthetic; run pnpm db:seed first.");

    const pick = async (kind: "staff" | "student", count: number) => {
      const rows = await db.select({ id: users.id }).from(users).where(eq(users.kind, kind));
      return Array.from({ length: count }, (_, i) => rows[i % rows.length]!.id);
    };
    const plan = [
      ...(await pick("student", Number(values.students ?? 450))).map((id) => ({ id, surface: "student" as const })),
      ...(await pick("staff", Number(values.staff ?? 50))).map((id) => ({ id, surface: "staff" as const })),
    ];
    const sessions: { surface: string; cookie: string; token: string }[] = [];
    let refused = 0;
    for (const p of plan) {
      try {
        const { token } = await createSession(db, { userId: p.id, surface: p.surface, method: "dev" });
        sessions.push({ surface: p.surface, cookie: `creo_${p.surface}_session`, token });
      } catch {
        refused++; // e.g. a withdrawn student or a staff member with no role
      }
    }
    writeFileSync(values.out, JSON.stringify(sessions));
    console.log(JSON.stringify({ created: sessions.length, refused, out: values.out }));
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
