import { createRemoteJWKSet, jwtVerify } from "jose";
import { getAuthConfig } from "./config";

export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  email: string;
  displayName: string;
  /** IANA time-zone name from the `zoneinfo` claim, if the issuer provides one. */
  timeZone?: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/**
 * Verifies an OIDC ID token (signature via the issuer's JWKS, plus `iss`,
 * `aud`, and expiry) and returns the identity claims the app cares about.
 */
export async function verifyIdToken(idToken: string): Promise<VerifiedIdentity> {
  const config = getAuthConfig();
  jwks ??= createRemoteJWKSet(new URL(config.jwksUrl));

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: config.issuer,
    audience: config.audience,
  });

  if (!payload.sub) {
    throw new Error("ID token is missing the sub claim");
  }
  const email = typeof payload.email === "string" ? payload.email : undefined;
  if (!email) {
    throw new Error("ID token is missing the email claim");
  }
  const name = typeof payload.name === "string" ? payload.name : undefined;
  const zoneinfo =
    typeof payload.zoneinfo === "string" ? payload.zoneinfo : undefined;

  return {
    issuer: config.issuer,
    subject: payload.sub,
    email,
    displayName: name ?? email.split("@")[0],
    timeZone: zoneinfo,
  };
}
