import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiAvailability } from "./grants";
import {
  AiAdminError, grantAi, listAi, operatorByEmail, parseFeatures, parseRole, revokeAi, type AiTarget,
} from "./admin";

// pnpm ai:grant  --role leader | --user someone@creoprep.org  [--feature dashboards.widget ...] [--note "..."]
// pnpm ai:revoke --role leader | --user someone@creoprep.org  [--feature ...] [--note "..."]
// pnpm ai:list
// Runs against DATABASE_URL (production via the Cloud SQL proxy). The operator is
// --as <email>, or the active gcloud account.

function operatorEmail(as: string | undefined): string {
  if (as) return as;
  try {
    const account = execFileSync("gcloud", ["config", "get-value", "account"], { encoding: "utf8" }).trim();
    if (account) return account;
  } catch {
    // fall through
  }
  throw new AiAdminError("Couldn't tell who is running this. Pass --as you@creoprep.org or sign in with gcloud.");
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      role: { type: "string" }, user: { type: "string" }, feature: { type: "string", multiple: true },
      note: { type: "string" }, as: { type: "string" },
    },
  });

  const url = process.env.DATABASE_URL;
  if (!url) throw new AiAdminError("Set DATABASE_URL to the database to change.");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);
  try {
    const operator = await operatorByEmail(db, operatorEmail(values.as));
    if (command === "list") {
      const rows = await listAi(db, operator);
      if (rows.length === 0) console.log("No active AI grants. AI is off for everyone.");
      for (const r of rows) {
        console.log(
          `${r.effect.padEnd(6)} ${String(r.target).padEnd(32)} ${(r.features?.join(",") ?? "all features").padEnd(28)} ` +
            `by ${r.grantedBy} on ${r.grantedAt.toISOString().slice(0, 10)}${r.note ? `  (${r.note})` : ""}`,
        );
      }
    } else if (command === "grant" || command === "revoke") {
      if (Boolean(values.role) === Boolean(values.user)) throw new AiAdminError("Pass exactly one of --role or --user.");
      const target: AiTarget = values.role ? { role: parseRole(values.role) } : { email: values.user! };
      const features = parseFeatures(values.feature ?? []);
      const message = await db.transaction((tx) =>
        command === "grant" ? grantAi(tx, operator, target, features, values.note) : revokeAi(tx, operator, target, features, values.note),
      );
      console.log(message);
    } else {
      throw new AiAdminError("Usage: pnpm ai:grant | ai:revoke | ai:list (see src/core/ai/cli.ts)");
    }
    const { switchedOn, configured } = aiAvailability();
    if (!switchedOn) console.log("Note: AI_ENABLED=false in this environment, so AI is off for everyone regardless of grants.");
    else if (!configured) console.log("Note: no ANTHROPIC_API_KEY in this environment; the app needs one for AI to work.");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof AiAdminError ? error.message : error);
  process.exit(1);
});
