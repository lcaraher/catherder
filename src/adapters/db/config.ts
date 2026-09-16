// Database connection settings, read from environment variables.

const DEFAULT_POOL_MAX = 4;
const DEFAULT_PORT = 5432;

/** DATABASE_URL carries everything; local development and CI. */
export interface UrlDatabaseConfig {
  mode: "url";
  connectionString: string;
  max: number;
}

/** Credentials come from the RDS-managed secret; the AWS deployment. */
export interface SecretDatabaseConfig {
  mode: "secret";
  secretArn: string;
  host: string;
  port: number;
  database: string;
  /** Path to the CA bundle that signs the server certificate. */
  sslCaPath: string;
  max: number;
}

/** `next build` evaluates route modules with no database; nothing may connect. */
export interface UnconfiguredDatabaseConfig {
  mode: "unconfigured";
  max: number;
}

export type DatabaseConfig =
  | UrlDatabaseConfig
  | SecretDatabaseConfig
  | UnconfiguredDatabaseConfig;

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function poolMax(env: Env): number {
  const raw = env.DB_POOL_MAX;
  if (raw === undefined || raw === "") return DEFAULT_POOL_MAX;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("DB_POOL_MAX must be a positive integer");
  }
  return value;
}

function port(env: Env): number {
  const raw = env.DATABASE_PORT;
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("DATABASE_PORT must be a TCP port number");
  }
  return value;
}

/** Picks URL mode or secret mode from the environment; throws when neither is configured. */
export function resolveDatabaseConfig(
  env: Env = process.env,
): DatabaseConfig {
  const max = poolMax(env);
  if (env.DATABASE_URL) {
    return { mode: "url", connectionString: env.DATABASE_URL, max };
  }
  if (env.DATABASE_SECRET_ARN) {
    return {
      mode: "secret",
      secretArn: env.DATABASE_SECRET_ARN,
      host: required(env, "DATABASE_HOST"),
      port: port(env),
      database: required(env, "DATABASE_NAME"),
      sslCaPath: required(env, "DATABASE_SSL_CA"),
      max,
    };
  }
  if (env.NEXT_PHASE === "phase-production-build") {
    return { mode: "unconfigured", max };
  }
  throw new Error(
    "Missing database configuration: set DATABASE_URL, or DATABASE_SECRET_ARN with DATABASE_HOST, DATABASE_NAME, and DATABASE_SSL_CA",
  );
}
