// Auth settings the handlers need; a shell or .env value wins over these.
// The JWKS URL is set by the test once its local JWKS server has a port.
process.env.AUTH_ISSUER ??= "http://localhost:3001";
process.env.AUTH_AUDIENCE ??= "catherder";
process.env.AUTH_SESSION_SECRET ??= "integration-test-session-secret";
process.env.AUTH_DEV_ISSUER = "true";
