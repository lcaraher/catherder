// Lambda handler that runs `prisma migrate deploy` against the deployment database.

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const PRISMA_CLI = path.join(here, "node_modules", "prisma", "build", "index.js");
const SCHEMA = path.join(here, "prisma", "schema.prisma");
const DEFAULT_PORT = 5432;
const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

function required(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function port(env) {
  const raw = env.DATABASE_PORT;
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("DATABASE_PORT must be a TCP port number");
  }
  return value;
}

// Parses the JSON RDS writes into the secret: { "username", "password", ... }.
function parseSecretString(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("database secret is not JSON");
  }
  const record = typeof parsed === "object" && parsed !== null ? parsed : {};
  const { username, password } = record;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    throw new Error("database secret is missing username or password");
  }
  return { username, password };
}

async function fetchCredentials(secretArn) {
  const { SecretsManagerClient, GetSecretValueCommand } = await import(
    "@aws-sdk/client-secrets-manager"
  );
  const client = new SecretsManagerClient({});
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!result.SecretString) {
    throw new Error("database secret has no string value");
  }
  return parseSecretString(result.SecretString);
}

// DATABASE_URL wins as given (local and CI); otherwise the URL is built from the RDS-managed secret.
async function resolveDatabaseUrl(env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const secretArn = required(env, "DATABASE_SECRET_ARN");
  const host = required(env, "DATABASE_HOST");
  const database = required(env, "DATABASE_NAME");
  const sslCa = required(env, "DATABASE_SSL_CA");
  const dbPort = port(env);
  const { username, password } = await fetchCredentials(secretArn);
  // sslaccept=strict is Prisma's certificate-verification switch; sslmode alone does not verify.
  return (
    `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}` +
    `@${host}:${dbPort}/${database}` +
    `?sslmode=require&sslcert=${sslCa}&sslaccept=strict&connection_limit=1`
  );
}

// The event payload is ignored; every invoke applies whatever migrations are pending.
export async function handler() {
  const url = await resolveDatabaseUrl(process.env);
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [PRISMA_CLI, "migrate", "deploy", "--schema", SCHEMA],
      {
        cwd: here,
        env: { ...process.env, DATABASE_URL: url },
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
      },
    );
    return { ok: true, output: stdout };
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const code = error?.killed ? "timeout" : `exit code ${error?.code}`;
    throw new Error(stderr || `prisma migrate deploy failed (${code})`);
  }
}
