import { writeFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { THEMES } from "../../src/domain/theme";

const EVENT_NAME = "Seed Campaign Kickoff";
const ORGANIZER = "Greta Master";
const PARTICIPANT = "Pat Player";
const AXE_PROJECT = "light-desktop";
const IMPACTS = ["critical", "serious", "moderate", "minor"] as const;

// Routes are templates; <id> is filled in from the home page.
const SIGNED_OUT = ["/", "/join", "/join/NOSUCHCODE0", "/help", "/nowhere"];
const AS_ORGANIZER = [
  "/",
  "/availability",
  "/events/new",
  "/admin",
  "/e/<id>/manage",
  "/e/<id>/responses",
];
const AS_PARTICIPANT = ["/", "/e/<id>/respond"];
// /dev-login and a valid /join link are not captured: the first lists whatever
// users the local database holds, the second only ever redirects.
const ROUTE_COUNT =
  SIGNED_OUT.length + AS_ORGANIZER.length + AS_PARTICIPANT.length;

interface Seed {
  eventId: string;
}

interface AxeEntry {
  route: string;
  state: string;
  violations: { id: string; impact: string | null; nodes: number }[];
}

// Both are per worker; a worker restart rebuilds them.
let seed: Seed | undefined;
const axeRecord: AxeEntry[] = [];

test.beforeAll(async ({ request }) => {
  const status = await request.get("/api/health").then(
    (response) => response.status(),
    () => 0,
  );
  if (status !== 200) throw new Error("dev server not running on :3001");
});

// Writes the record only when every route was analysed in this worker.
test.afterAll(async () => {
  if (axeRecord.length !== ROUTE_COUNT) return;
  const sorted = [...axeRecord].sort(
    (a, b) => a.route.localeCompare(b.route) || a.state.localeCompare(b.state),
  );
  writeFileSync(
    path.join(test.info().project.testDir, "axe-baseline.json"),
    `${JSON.stringify(sorted, null, 2)}\n`,
  );
  for (const entry of sorted) {
    const counts = IMPACTS.map(
      (impact) =>
        `${entry.violations.filter((v) => v.impact === impact).length} ${impact}`,
    );
    console.log(
      `axe ${entry.route} (${entry.state}): ${entry.violations.length} violations (${counts.join(", ")})`,
    );
  }
});

// Puts the seeded accounts back on the seed's theme, whichever project ran last.
test.afterAll(async ({ browser }) => {
  for (const displayName of [ORGANIZER, PARTICIPANT]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signIn(page, displayName);
      const saved = await page.request.post("/api/me/theme", {
        data: { theme: "light" },
      });
      expect(saved.ok()).toBe(true);
    } finally {
      await context.close();
    }
  }
});

// The project's theme, from its name; only callable inside a test or hook.
function projectTheme(): "light" | "dark" {
  return test.info().project.name.startsWith("dark") ? "dark" : "light";
}

async function signIn(page: Page, displayName: string) {
  await page.goto("/dev-login");
  await page.getByRole("button", { name: displayName, exact: true }).click();
  await page.waitForURL("/");
}

// Reads the seed event's id from the home page, then creates the event's
// invite on the manage page when it has none.
async function readSeed(browser: Browser): Promise<Seed> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, ORGANIZER);
    const href = await page
      .locator('a[href^="/e/"][href$="/manage"]', { hasText: EVENT_NAME })
      .getAttribute("href");
    const eventId = href?.match(/^\/e\/([^/]+)\/manage$/)?.[1];
    if (!eventId) throw new Error(`no manage link for "${EVENT_NAME}" on /`);

    await page.goto(`/e/${eventId}/manage`);
    const create = page.getByRole("button", { name: "Create invite", exact: true });
    if ((await create.count()) > 0) await create.click();
    // The invite panel's button shows once the invite exists.
    await expect(
      page.getByRole("button", { name: "Regenerate", exact: true }),
    ).toBeVisible();
    return { eventId };
  } finally {
    await context.close();
  }
}

function resolveRoute(route: string): string {
  if (!route.includes("<")) return route;
  if (!seed) throw new Error("seed event was not read");
  return route.replace("<id>", seed.eventId);
}

// "/e/<id>/manage" + "greta" gives "e-manage-greta.png"; "/" gives "home-…".
function shotName(route: string, state: string): string {
  const slug = route
    .replace("<id>/", "")
    .replace(/[<>]/g, "")
    .split("/")
    .filter(Boolean)
    .join("-");
  return `${slug || "home"}-${state}.png`;
}

// One describe per sign-in state, each on its own browser context.
function captureState(
  title: string,
  state: string,
  routes: string[],
  options: { signInAs?: string; needsSeed?: boolean } = {},
) {
  test.describe(title, () => {
    let context: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      if (options.needsSeed) seed ??= await readSeed(browser);
      const theme = projectTheme();
      context = await browser.newContext();
      page = await context.newPage();
      if (options.signInAs) {
        await signIn(page, options.signInAs);
        // Sets the account and the cookie, whatever the database held before.
        const saved = await page.request.post("/api/me/theme", {
          data: { theme },
        });
        expect(saved.ok()).toBe(true);
      } else {
        await context.addCookies([
          { name: "catherder_theme", value: theme, domain: "localhost", path: "/" },
        ]);
      }
    });

    test.afterAll(async () => {
      await context?.close();
    });

    for (const route of routes) {
      test(`${title}: ${route}`, async () => {
        await page.goto(resolveRoute(route));
        // fullPage is not accepted by the config's toHaveScreenshot block.
        await expect(page).toHaveScreenshot(shotName(route, state), {
          fullPage: true,
        });
      });
    }

    if (!options.signInAs) {
      // The attribute is in the first HTML response, so no theme flash.
      test(`${title}: theme attribute in the initial HTML`, async ({ request }) => {
        const dark = await request.get("/", {
          headers: { cookie: "catherder_theme=dark" },
        });
        expect(await dark.text()).toContain('data-theme="dark"');
        const none = await request.get("/");
        expect(await none.text()).toContain('data-theme="light"');
      });
    }

    if (!options.signInAs) {
      // Own context: the choice must not reach the shared page's cookie.
      test(`${title}: the dot opens a picker of every theme`, async ({ browser }) => {
        const fresh = await browser.newContext();
        try {
          const visitor = await fresh.newPage();
          await visitor.goto("/join");
          await visitor.getByRole("button", { name: "More themes" }).click();
          const picker = visitor.getByRole("group", { name: "Themes" });
          await expect(picker.getByRole("button")).toHaveText(
            THEMES.map((name) => new RegExp(`${name}$`, "i")),
          );
          await picker.getByRole("button", { name: "Dark" }).click();
          await expect(visitor.locator("html")).toHaveAttribute(
            "data-theme",
            "dark",
          );
          await expect(picker).toBeHidden();
        } finally {
          await fresh.close();
        }
      });
    }

    // A record, not a gate: violations never fail the test.
    test(`${title}: axe record`, async () => {
      test.skip(
        test.info().project.name !== AXE_PROJECT,
        `recorded once, on ${AXE_PROJECT}`,
      );
      for (const route of routes) {
        await page.goto(resolveRoute(route));
        const { violations } = await new AxeBuilder({ page }).analyze();
        axeRecord.push({
          route,
          state,
          violations: violations.map((v) => ({
            id: v.id,
            impact: v.impact ?? null,
            nodes: v.nodes.length,
          })),
        });
      }
    });
  });
}

captureState("signed out", "signed-out", SIGNED_OUT);
captureState("as Greta Master", "greta", AS_ORGANIZER, {
  signInAs: ORGANIZER,
  needsSeed: true,
});
captureState("as Pat Player", "pat", AS_PARTICIPANT, {
  signInAs: PARTICIPANT,
  needsSeed: true,
});
