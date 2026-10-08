import { randomBytes } from "node:crypto";
import type { Surface } from "../surfaces";

// The Google sign-in handshake (OAuth 2.0 authorization code + PKCE + OIDC
// nonce), kept free of Next.js and of network calls so it can be tested. The
// route handlers in src/app/api/auth/google supply the network pieces.

export type GoogleSurface = Extract<Surface, "staff" | "student">;
export const GOOGLE_SURFACES: readonly GoogleSurface[] = ["staff", "student"];

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  domain: string;
}

/** Stored in a short-lived httpOnly cookie between /start and /callback. */
export interface FlowState {
  state: string;
  nonce: string;
  codeVerifier: string;
  surface: GoogleSurface;
}

export const FLOW_COOKIE = "creo_google_flow";
export const FLOW_COOKIE_PATH = "/api/auth/google";
export const FLOW_MAX_AGE_SECONDS = 600;

export function newFlowState(surface: GoogleSurface, codeVerifier: string): FlowState {
  return { state: randomBytes(24).toString("base64url"), nonce: randomBytes(24).toString("base64url"), codeVerifier, surface };
}

export function parseFlowCookie(value: string | undefined): FlowState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<FlowState>;
    if (
      typeof parsed.state === "string" && typeof parsed.nonce === "string" && typeof parsed.codeVerifier === "string" &&
      (GOOGLE_SURFACES as readonly string[]).includes(parsed.surface ?? "")
    ) {
      return parsed as FlowState;
    }
  } catch {
    // fall through
  }
  return null;
}

export function serializeFlowCookie(flow: FlowState): string {
  return Buffer.from(JSON.stringify(flow), "utf8").toString("base64url");
}

/** The ID token claims we rely on, after Google's signature, audience, and expiry checks. */
export interface IdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  hd?: string;
  nonce?: string;
}

export type GoogleRefusal =
  | "cancelled" // the person backed out at Google
  | "expired" // the flow cookie is missing or stale
  | "state_mismatch"
  | "wrong_domain" // not a Workspace account on our domain
  | "unverified_email"
  | "nonce_mismatch";

export interface CallbackDeps {
  /** Exchanges the authorization code (with the PKCE verifier) for an ID token. */
  exchange: (code: string, codeVerifier: string) => Promise<string>;
  /** Verifies signature, audience, issuer, and expiry, returning the claims. */
  verify: (idToken: string) => Promise<IdTokenClaims>;
}

/**
 * Checks Google's callback and returns the verified account, or why it was
 * refused. The `hd` claim is checked here on the server; the `hd` parameter
 * in the sign-in URL only hints Google's account picker.
 */
export async function verifyCallback(
  params: { code?: string | null; state?: string | null; error?: string | null },
  flow: FlowState | null,
  config: Pick<GoogleConfig, "domain">,
  deps: CallbackDeps,
): Promise<{ ok: true; email: string; sub: string; surface: GoogleSurface } | { ok: false; reason: GoogleRefusal }> {
  if (!flow) return { ok: false, reason: "expired" };
  if (params.error || !params.code) return { ok: false, reason: "cancelled" };
  if (!params.state || params.state !== flow.state) return { ok: false, reason: "state_mismatch" };

  const claims = await deps.verify(await deps.exchange(params.code, flow.codeVerifier));
  if (claims.nonce !== flow.nonce) return { ok: false, reason: "nonce_mismatch" };
  const domain = config.domain.toLowerCase();
  const email = claims.email?.toLowerCase();
  if (claims.hd?.toLowerCase() !== domain || !email?.endsWith(`@${domain}`)) return { ok: false, reason: "wrong_domain" };
  if (claims.email_verified !== true) return { ok: false, reason: "unverified_email" };
  return { ok: true, email, sub: claims.sub, surface: flow.surface };
}
