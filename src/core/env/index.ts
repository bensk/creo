import { z } from "zod";

// Every environment variable the server reads is declared and validated here.
// Production safety checks live here too, so a misconfigured deploy fails at boot.
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      // Report variable names only; values may be secrets.
      const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new Error(`Invalid server environment: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}
