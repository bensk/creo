import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    globalSetup: ["tests/setup/test-db.ts"],
    // Tests that write the full seed in a transaction queue behind each other on
    // the school's unique DBN, so they can take longer than the 5 s default.
    testTimeout: 30_000,
    env: {
      // Tests always run against the test database, never dev data, and as the
      // app role (creo_app), never the owner.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://creo_app:creo_app@localhost:5432/creo_test",
    },
  },
});
