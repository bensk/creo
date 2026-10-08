import { defineConfig } from "drizzle-kit";

// Each module owns its tables in its own schema.ts; core tables live under src/core.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/core/**/schema.ts", "./src/modules/*/schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://creo:creo@localhost:5432/creo_dev",
  },
  strict: true,
  verbose: true,
});
