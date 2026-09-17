// Runs once when the server boots (dev and production), never during `next build`.
// Refuses the dev issuer in production, then loads the session secret if deployed.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertDevIssuerNotInProduction } = await import(
    "./adapters/auth/config"
  );
  assertDevIssuerNotInProduction();
  const { loadSessionSecretIntoEnv } = await import(
    "./adapters/auth/session-secret"
  );
  await loadSessionSecretIntoEnv();
}
