// Auth configuration, read from environment variables.

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
  /** Hostname of the hosted login page, no scheme; optional only with the dev issuer. */
  loginDomain?: string;
  /** OAuth client id for the authorize and token requests; defaults to the audience. */
  clientId: string;
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

function loginDomain(devIssuerEnabled: boolean): string | undefined {
  const value = devIssuerEnabled
    ? process.env.AUTH_LOGIN_DOMAIN || undefined
    : required("AUTH_LOGIN_DOMAIN");
  if (value && /[/:]/.test(value)) {
    throw new Error(
      "AUTH_LOGIN_DOMAIN must be a bare hostname, no scheme or path",
    );
  }
  return value;
}

let cached: AuthConfig | undefined;

// Validated lazily on first use; importing this module never throws at build time.
export function getAuthConfig(): AuthConfig {
  if (!cached) {
    assertDevIssuerNotInProduction();
    const devIssuerEnabled = process.env.AUTH_DEV_ISSUER === "true";
    const audience = required("AUTH_AUDIENCE");
    cached = {
      issuer: required("AUTH_ISSUER"),
      audience,
      jwksUrl: required("AUTH_JWKS_URL"),
      sessionSecret: required("AUTH_SESSION_SECRET"),
      devIssuerEnabled,
      loginDomain: loginDomain(devIssuerEnabled),
      clientId: process.env.AUTH_CLIENT_ID || audience,
    };
  }
  return cached;
}
