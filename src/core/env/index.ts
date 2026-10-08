import { z } from "zod";

// Every environment variable the server reads is declared and validated here.
// Production safety checks live here too, so a misconfigured deploy fails at boot.
const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    // Local development only. See core/auth/dev.
    DEV_SIGN_IN: z.enum(["true", "false"]).optional(),
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
