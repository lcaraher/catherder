import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const DEFAULT_POOL_MAX = 4;

function poolMax(): number {
  const raw = process.env.DB_POOL_MAX;
  if (raw === undefined || raw === "") return DEFAULT_POOL_MAX;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("DB_POOL_MAX must be a positive integer");
  }
  return value;
}

// One PrismaClient over a pg pool from DATABASE_URL, sized by DB_POOL_MAX.
// No connection is opened until the first query.
export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (
    !connectionString &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    throw new Error("Missing required environment variable DATABASE_URL");
  }
  const pool = new Pool({ connectionString, max: poolMax() });
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
