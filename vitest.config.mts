import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Integration tests only; the unit tests under src/ stay on node:test.
// `.env` fills in anything the shell did not set, as the Prisma CLI does.
const fileEnv = loadEnv("test", process.cwd(), "");
for (const [key, value] of Object.entries(fileEnv)) {
  process.env[key] ??= value;
}

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    passWithNoTests: true,
  },
});
