// Session-cookie secret: AUTH_SESSION_SECRET as given, or fetched once from
// Secrets Manager when only AUTH_SESSION_SECRET_ARN is set.
import { fetchSecretString } from "../db/secret.ts";

export type SecretFetcher = (secretArn: string) => Promise<string>;

export interface SessionSecretEnv {
  AUTH_SESSION_SECRET?: string;
  AUTH_SESSION_SECRET_ARN?: string;
}

/** The env value wins; the secret is plain text, not JSON. */
export async function resolveSessionSecret(
  env: SessionSecretEnv,
  fetcher: SecretFetcher,
): Promise<string | undefined> {
  if (env.AUTH_SESSION_SECRET) return env.AUTH_SESSION_SECRET;
  const arn = env.AUTH_SESSION_SECRET_ARN;
  if (!arn) return undefined;
  const value = await fetcher(arn);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("session secret from Secrets Manager is empty");
  }
  return value;
}

/** Fills AUTH_SESSION_SECRET from the ARN so getAuthConfig() reads it as usual. */
export async function loadSessionSecretIntoEnv(): Promise<void> {
  const env = {
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    AUTH_SESSION_SECRET_ARN: process.env.AUTH_SESSION_SECRET_ARN,
  };
  const fromEnv = Boolean(env.AUTH_SESSION_SECRET);
  const value = await resolveSessionSecret(env, fetchSecretString);
  if (fromEnv || value === undefined) return;
  process.env.AUTH_SESSION_SECRET = value;
  console.info("auth: session secret loaded from Secrets Manager");
}
