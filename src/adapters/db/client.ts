import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { resolveDatabaseConfig, type DatabaseConfig } from "./config.ts";
import { attachCredentialSource, passwordProvider } from "./pool.ts";
import { databaseCredentials } from "./secret.ts";

/** Builds the pg pool for the resolved configuration; no connection opens until the first query. */
export function createPool(config: DatabaseConfig): Pool {
  switch (config.mode) {
    case "url":
      return new Pool({
        connectionString: config.connectionString,
        max: config.max,
      });
    case "secret": {
      const source = databaseCredentials(config.secretArn);
      const pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        password: passwordProvider(source),
        ssl: {
          rejectUnauthorized: true,
          ca: readFileSync(config.sslCaPath, "utf8"),
        },
        max: config.max,
      });
      return attachCredentialSource(pool, source);
    }
    case "unconfigured":
      return new Pool({ max: config.max });
  }
}

// One PrismaClient over a pg pool, sized by DB_POOL_MAX.
// No connection is opened until the first query.
export function createPrismaClient(): PrismaClient {
  const pool = createPool(resolveDatabaseConfig());
  // $disconnect() ends the pool too, so one-shot scripts can exit.
  return new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: true }),
  });
}

// Reuse one client across dev hot-reloads to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
