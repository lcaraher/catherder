import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import type { User } from "@prisma/client";
import { getAuthConfig } from "./config";

// Dev-only OIDC issuer: signs ID tokens and serves the matching JWKS at
// /api/dev-auth/jwks. Enabled via AUTH_DEV_ISSUER=true; refused in production.

const DEV_KEY_ID = "catherder-dev-key";
const ALG = "RS256";

interface DevIssuerKeys {
  privateKey: CryptoKey;
  jwks: { keys: JWK[] };
}

// Cached on globalThis so the signing key survives dev-server hot reloads.
const globalForDevIssuer = globalThis as unknown as {
  devIssuerKeys?: Promise<DevIssuerKeys>;
};

async function generateKeys(): Promise<DevIssuerKeys> {
  const { publicKey, privateKey } = await generateKeyPair(ALG, {
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  jwk.kid = DEV_KEY_ID;
  jwk.alg = ALG;
  jwk.use = "sig";
  return { privateKey: privateKey as CryptoKey, jwks: { keys: [jwk] } };
}

function getKeys(): Promise<DevIssuerKeys> {
  if (!getAuthConfig().devIssuerEnabled) {
    throw new Error("dev issuer is disabled (AUTH_DEV_ISSUER is not true)");
  }
  globalForDevIssuer.devIssuerKeys ??= generateKeys();
  return globalForDevIssuer.devIssuerKeys;
}

export function isDevIssuerEnabled(): boolean {
  return getAuthConfig().devIssuerEnabled;
}

/** JWKS document served at /api/dev-auth/jwks. */
export async function getDevJwks(): Promise<{ keys: JWK[] }> {
  return (await getKeys()).jwks;
}

/** Mints a short-lived, signed OIDC ID token for the given user. */
export async function mintDevIdToken(user: User): Promise<string> {
  const { privateKey } = await getKeys();
  const config = getAuthConfig();
  return new SignJWT({
    email: user.email,
    name: user.displayName,
    zoneinfo: user.timeZone,
  })
    .setProtectedHeader({ alg: ALG, kid: DEV_KEY_ID })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(`dev|${user.id}`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}
