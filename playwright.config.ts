import { defineConfig, devices } from "@playwright/test";

const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };

// No webServer block: the dev server on :3001 is started by hand.
export default defineConfig({
  testDir: "tests/visual",
  fullyParallel: false,
  // The suite creates one invite, so projects must not overlap.
  workers: 1,
  retries: 0,
  reporter: "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}-{projectName}{ext}",
  use: {
    baseURL: "http://localhost:3001",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
      stylePath: "tests/visual/screenshot.css",
    },
  },
  projects: [
    {
      name: "light-phone",
      use: { ...devices["Desktop Chrome"], viewport: phone },
    },
    {
      name: "light-desktop",
      use: { ...devices["Desktop Chrome"], viewport: desktop },
    },
    {
      name: "dark-phone",
      use: { ...devices["Desktop Chrome"], viewport: phone },
    },
    {
      name: "dark-desktop",
      use: { ...devices["Desktop Chrome"], viewport: desktop },
    },
  ],
});
