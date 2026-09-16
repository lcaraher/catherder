// Database credentials from the RDS-managed secret in AWS Secrets Manager.

export interface DatabaseCredentials {
  username: string;
  password: string;
}

export type CredentialFetcher = (
  secretArn: string,
) => Promise<DatabaseCredentials>;

export interface CredentialSource {
  /** Current credentials, fetched at most once per cache period. */
  get(): Promise<DatabaseCredentials>;
  /** Drops the cached value so the next get() fetches again. */
  invalidate(): void;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

/** Parses the JSON RDS writes into the secret: { "username", "password", ... }. */
export function parseSecretString(raw: string): DatabaseCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("database secret is not JSON");
  }
  const record =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  const { username, password } = record;
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password
  ) {
    throw new Error("database secret is missing username or password");
  }
  return { username, password };
}

type SecretsManager = {
  send(command: unknown): Promise<{ SecretString?: string }>;
};

let client: SecretsManager | undefined;

// The SDK is loaded on first use so URL-mode processes never import it.
async function fetchFromSecretsManager(
  secretArn: string,
): Promise<DatabaseCredentials> {
  const { SecretsManagerClient, GetSecretValueCommand } = await import(
    "@aws-sdk/client-secrets-manager"
  );
  client ??= new SecretsManagerClient({});
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!result.SecretString) {
    throw new Error("database secret has no string value");
  }
  return parseSecretString(result.SecretString);
}

/** Caches one fetch of the secret for `ttlMs`; concurrent callers share the in-flight fetch. */
export function createCredentialSource(
  secretArn: string,
  fetcher: CredentialFetcher,
  options: { ttlMs?: number; now?: () => number } = {},
): CredentialSource {
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  let cached: { value: Promise<DatabaseCredentials>; expiresAt: number } | undefined;

  return {
    get() {
      if (cached && cached.expiresAt > now()) return cached.value;
      const entry = { value: fetcher(secretArn), expiresAt: now() + ttlMs };
      cached = entry;
      // A failed fetch is not kept, so the next call retries.
      entry.value.catch(() => {
        if (cached === entry) cached = undefined;
      });
      return entry.value;
    },
    invalidate() {
      cached = undefined;
    },
  };
}

let defaultSource: CredentialSource | undefined;

/** Credentials for the deployment's secret, cached for ten minutes. */
export function databaseCredentials(secretArn: string): CredentialSource {
  defaultSource ??= createCredentialSource(secretArn, fetchFromSecretsManager);
  return defaultSource;
}

export function invalidate(): void {
  defaultSource?.invalidate();
}
