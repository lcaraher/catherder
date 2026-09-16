import { createHash, randomBytes } from "node:crypto";

// PKCE (RFC 7636) helpers for the authorization-code login flow.

/** Random code_verifier: 32 bytes as base64url, 43 unreserved characters. */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** S256 code_challenge for a verifier. */
export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** Random opaque state for the authorize request. */
export function generateState(): string {
  return randomBytes(16).toString("base64url");
}
