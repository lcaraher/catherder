import { expect, type Locator, type Page } from "@playwright/test";

export const ORGANIZER = "Greta Master";
export const DENSE_EVENT_NAME = "Seed Dense Session";

export async function signIn(page: Page, displayName: string) {
  await page.goto("/dev-login");
  await page.getByRole("button", { name: displayName, exact: true }).click();
  await page.waitForURL("/");
}

// The event's id from its manage link on the home page.
export async function readEventId(page: Page, name: string): Promise<string> {
  const href = await page
    .locator('a[href^="/e/"][href$="/manage"]', { hasText: name })
    .first()
    .getAttribute("href");
  const eventId = href?.match(/^\/e\/([^/]+)\/manage$/)?.[1];
  if (!eventId) throw new Error(`no manage link for "${name}" on /`);
  return eventId;
}

// Resolves once React has hydrated the element and attached its handlers.
export async function waitForHydration(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
}
