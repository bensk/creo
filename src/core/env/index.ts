import { z } from "zod";

// Every environment variable the server reads is declared and validated here.
// Production safety checks live here too, so a misconfigured deploy fails at boot.
const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    // Local development only. See core/auth/dev.
    DEV_SIGN_IN: z.enum(["true", "false"]).optional(),
    // AI is off unless grants exist; AI_ENABLED=false turns it off for everyone.
    AI_ENABLED: z.enum(["true", "false"]).default("true"),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_MODEL: z.string().min(1).optional(),
    // Google sign-in. Without these, sign-in pages say Google sign-in isn't set up.
    APP_URL: z.url().optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    WORKSPACE_DOMAIN: z.string().min(1).default("creoprep.org"),
    // Directory (Admin SDK) via a service account with domain-wide delegation.
    GOOGLE_DIRECTORY_CREDENTIALS: z.string().min(1).optional(),
    GOOGLE_DIRECTORY_ADMIN: z.email().optional(),
    // Cloud Storage bucket for files (pronunciation audio, photos, slips). Without
    // it, development and tests keep files under data/files; production refuses.
    FILES_BUCKET: z.string().min(1).optional(),
  })
  .refine((env) => !(env.NODE_ENV === "production" && env.DEV_SIGN_IN !== undefined), {
    // Any value at all in production is a misconfiguration: refuse to start.
    path: ["DEV_SIGN_IN"],
    message: "must not be set in production",
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Test helper: forget the parsed environment so the next call re-reads process.env. */
export function resetServerEnvCache(): void {
  cached = undefined;
}

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      // Report variable names only; values may be secrets.
      const problems = parsed.error.issues
        .map((issue) => `${issue.path.join(".")}${issue.path[0] === "DEV_SIGN_IN" ? ` ${issue.message}` : ""}`)
        .join(", ");
      throw new Error(`Invalid server environment: ${problems}`);
    }
    cached = parsed.data;
  }
  return cached;
}
