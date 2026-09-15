import { execFileSync, execSync } from "node:child_process";

// Brings the database in DATABASE_URL to the current schema and seeds it.
// Skipped entirely when no database is configured.
export default function setup(): void {
  if (!process.env.DATABASE_URL) {
    console.log("integration: DATABASE_URL is not set; suite skipped");
    return;
  }
  const opts = { stdio: "inherit" as const, env: process.env };
  execSync("npx prisma migrate deploy", opts);
  execFileSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "prisma/seed.mts"],
    opts,
  );
}
