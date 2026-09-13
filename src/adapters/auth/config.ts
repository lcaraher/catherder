// Auth configuration boundary: everything is read from environment variables
// so the same code works against any OIDC issuer, with no cloud SDKs under src/.

export interface AuthConfig {
  /** Expected `iss` claim of incoming ID tokens. */
  issuer: string;
  /** Expected `aud` claim of incoming ID tokens. */
  audience: string;
  /** JWKS endpoint used to verify ID token signatures. */
  jwksUrl: string;
  /** HMAC secret for the httpOnly session cookie. */
  sessionSecret: string;
  /** Whether the built-in dev issuer (/dev-login, /api/dev-auth/*) is enabled. */
  devIssuerEnabled: boolean;
}

export function assertDevIssuerNotInProduction(): void {
  // NEXT_PHASE is set during `next build`, where NODE_ENV is always
  // "production"; the refusal applies to running servers, not builds.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (
    process.env.AUTH_DEV_ISSUER === "true" &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "AUTH_DEV_ISSUER=true is refused when NODE_ENV=production: the dev issuer mints valid ID tokens for any user and must never run in production.",
    );
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

let cached: AuthConfig | undefined;

// Lazy so importing auth code never throws at build time (Docker builds run
// without env vars); validation happens on first use per server process.
export function getAuthConfig(): AuthConfig {
  if (!cached) {
    assertDevIssuerNotInProduction();
    cached = {
      issuer: required("AUTH_ISSUER"),
      audience: required("AUTH_AUDIENCE"),
      jwksUrl: required("AUTH_JWKS_URL"),
      sessionSecret: required("AUTH_SESSION_SECRET"),
      devIssuerEnabled: process.env.AUTH_DEV_ISSUER === "true",
    };
  }
  return cached;
}
