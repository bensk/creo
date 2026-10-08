import { serverEnv } from "./core/env";

// Node-only startup checks, loaded from instrumentation.ts. A misconfigured
// production deploy (for example, DEV_SIGN_IN set) exits instead of running,
// so Cloud Run never routes traffic to it.
try {
  serverEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (process.env.NODE_ENV === "production") process.exit(1);
  throw error;
}
