import { defineConfig, devices } from "@playwright/test";
import { THEMES } from "./src/domain/theme";

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
  // One phone and one desktop project per theme, named "<theme>-<width>".
  projects: THEMES.flatMap((theme) => [
    {
      name: `${theme}-phone`,
      use: { ...devices["Desktop Chrome"], viewport: phone },
    },
    {
      name: `${theme}-desktop`,
      use: { ...devices["Desktop Chrome"], viewport: desktop },
    },
  ]),
});
