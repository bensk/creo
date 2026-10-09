import { OAuth2Client } from "google-auth-library";
import { NextResponse, type NextRequest } from "next/server";
import { googleConfig } from "@/core/auth/google/config";
import {
  FLOW_COOKIE, FLOW_COOKIE_PATH, FLOW_MAX_AGE_SECONDS, GOOGLE_SURFACES, newFlowState, serializeFlowCookie, type GoogleSurface,
} from "@/core/auth/google/flow";
import { SURFACES } from "@/core/auth/surfaces";

// GET /api/auth/google/start?surface=staff|student → Google's account picker.
export async function GET(request: NextRequest) {
  const surface = request.nextUrl.searchParams.get("surface") as GoogleSurface | null;
  if (!surface || !GOOGLE_SURFACES.includes(surface)) return new NextResponse(null, { status: 404 });
  const config = googleConfig();
  if (!config) return NextResponse.redirect(new URL(`${SURFACES[surface].signIn}?error=not_configured`, request.url));

  const client = new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri });
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const flow = newFlowState(surface, codeVerifier);
  const url = client.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    hd: config.domain,
    prompt: "select_account",
    state: flow.state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256" as never,
    nonce: flow.nonce,
  } as Parameters<OAuth2Client["generateAuthUrl"]>[0] & { nonce: string });

  const response = NextResponse.redirect(url);
  response.cookies.set(FLOW_COOKIE, serializeFlowCookie(flow), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: FLOW_COOKIE_PATH, maxAge: FLOW_MAX_AGE_SECONDS,
  });
  return response;
}
