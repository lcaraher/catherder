// Auth adapter boundary. Identity-provider integrations are configured through
// environment variables and exposed to the rest of the app only via this module.
// The IdP authenticates only; authorization roles come from the database.

export { getAuthConfig, assertDevIssuerNotInProduction } from "./config";
export { verifyIdToken, type VerifiedIdentity } from "./oidc";
export { loginWithIdToken } from "./login";
export { createSession, clearSession, readSessionUserId } from "./session";
export {
  getSessionUser,
  requireUser,
  requireRole,
  ForbiddenError,
} from "./guards";
export { isDevIssuerEnabled, getDevJwks, mintDevIdToken } from "./dev-issuer";
