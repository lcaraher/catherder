// Auth adapter boundary: all identity-provider access goes through this module.

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
