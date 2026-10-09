import type { GoogleConfig } from "./flow";

/** Google sign-in settings, or null when not configured (sign-in pages then say so). */
export function googleConfig(): GoogleConfig | null {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !APP_URL) return null;
  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: new URL("/api/auth/google/callback", APP_URL).toString(),
    domain: (process.env.WORKSPACE_DOMAIN ?? "creoprep.org").toLowerCase(),
  };
}
