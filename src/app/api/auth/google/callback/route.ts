import { OAuth2Client } from "google-auth-library";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { googleConfig } from "@/core/auth/google/config";
import { FLOW_COOKIE, FLOW_COOKIE_PATH, parseFlowCookie, verifyCallback } from "@/core/auth/google/flow";
import { resolveGoogleUser } from "@/core/auth/google/resolve";
import { signIn } from "@/core/auth/server";
import { SignInRefused } from "@/core/auth/session";
import { SURFACES } from "@/core/auth/surfaces";
import { getDb } from "@/core/db/client";
import { directoryFromEnv } from "@/core/google/directory";

// GET /api/auth/google/callback: Google sends people back here after they pick an account.
export async function GET(request: NextRequest) {
  const store = await cookies();
  const flow = parseFlowCookie(store.get(FLOW_COOKIE)?.value);
  store.delete({ name: FLOW_COOKIE, path: FLOW_COOKIE_PATH });
  const surface = flow?.surface ?? "staff";
  const refuse = (reason: string) => NextResponse.redirect(new URL(`${SURFACES[surface].signIn}?error=${reason}`, request.url));

  const config = googleConfig();
  if (!config) return refuse("not_configured");
  const client = new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri });
  const params = request.nextUrl.searchParams;

  let verified;
  try {
    verified = await verifyCallback(
      { code: params.get("code"), state: params.get("state"), error: params.get("error") },
      flow,
      config,
      {
        exchange: async (code, codeVerifier) => {
          const { tokens } = await client.getToken({ code, codeVerifier });
          if (!tokens.id_token) throw new Error("Google returned no ID token");
          return tokens.id_token;
        },
        verify: async (idToken) => {
          const ticket = await client.verifyIdToken({ idToken, audience: config.clientId });
          const payload = ticket.getPayload();
          if (!payload) throw new Error("Empty ID token");
          return payload;
        },
      },
    );
  } catch {
    return refuse("google_error");
  }
  if (!verified.ok) return refuse(verified.reason);

  const db = getDb();
  const resolved = await db.transaction((tx) =>
    resolveGoogleUser(tx, verified, verified.surface, verified.surface === "student" ? directoryFromEnv() : null),
  );
  if (!resolved.ok) return refuse(resolved.reason);

  try {
    await signIn(resolved.userId, verified.surface, "google");
  } catch (error) {
    if (error instanceof SignInRefused) return refuse(error.reason);
    throw error;
  }
  return NextResponse.redirect(new URL(SURFACES[verified.surface].home, request.url));
}
