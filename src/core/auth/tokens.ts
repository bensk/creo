import { createHash, randomBytes } from "node:crypto";

/** 256 bits of randomness, URL-safe. Only ever stored in the user's cookie. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores. A copy of the sessions table can't be used to sign in. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
