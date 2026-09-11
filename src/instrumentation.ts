// Runs once when the server boots (dev and production). Refuses to start a
// production server with the dev token issuer enabled.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertDevIssuerNotInProduction } = await import(
      "./adapters/auth/config"
    );
    assertDevIssuerNotInProduction();
  }
}
