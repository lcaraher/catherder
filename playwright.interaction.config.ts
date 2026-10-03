import { defineConfig, devices } from "@playwright/test";

const viewport = { width: 1280, height: 800 };

// No webServer block: the dev server on :3001 is started by hand.
export default defineConfig({
  testDir: "tests/interaction",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3001",
    reducedMotion: "no-preference",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport },
    },
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], channel: "msedge", viewport },
    },
  ],
});
