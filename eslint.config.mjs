import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // AI is optional: only AI code paths may import core/ai (CLAUDE.md, AI features).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/core/ai/**", "src/modules/*/ai/**", "src/core/db/schema.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^@/core/ai(/|$))|(/core/ai(/|$))|(^\\.\\.?/ai(/|$))",
              message: "Only AI code (src/modules/<module>/ai/, src/core/ai/) may import core/ai.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "drizzle/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
]);
