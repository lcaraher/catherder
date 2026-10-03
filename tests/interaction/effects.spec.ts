import { expect, test, type Locator, type Page } from "@playwright/test";
import { THEME_NAMES, THEMES, type Theme } from "../../src/domain/theme";
import {
  DENSE_EVENT_NAME,
  ORGANIZER,
  readEventId,
  signIn,
  waitForHydration,
} from "./session";

const POINTER_SEEN_KEY = "catherder-theme-pointer-seen";
const DESCRIPTION_MARK = ".";

// Each running animation or transition under the element, as "name" plus its pseudo-element.
function animations(locator: Locator): Promise<string[]> {
  return locator.evaluate((el) =>
    el.getAnimations({ subtree: true }).map((animation) => {
      const name =
        animation instanceof CSSAnimation
          ? animation.animationName
          : animation instanceof CSSTransition
            ? `transition:${animation.transitionProperty}`
            : animation.id;
      const pseudo =
        animation.effect instanceof KeyframeEffect
          ? (animation.effect.pseudoElement ?? "")
          : "";
      return `${name}${pseudo}`;
    }),
  );
}

function pseudoOpacity(locator: Locator, pseudo: string): Promise<string> {
  return locator.evaluate((el, p) => getComputedStyle(el, p).opacity, pseudo);
}

// The computed transform as [scale x, translate x, translate y], rounded.
function transformParts(locator: Locator): Promise<number[]> {
  return locator.evaluate((el) => {
    const value = getComputedStyle(el).transform;
    const m = new DOMMatrixReadOnly(value === "none" ? undefined : value);
    return [Number(m.a.toFixed(3)), Number(m.e.toFixed(1)), Number(m.f.toFixed(2))];
  });
}

async function denseEventId(page: Page): Promise<string> {
  return readEventId(page, DENSE_EVENT_NAME);
}

// Hovers the centre of the element's box; in Chromium a pixel-pointer link's first quad is its ::before arrow.
async function hoverBox(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  await locator.hover({ position: { x: box.width / 2, y: box.height / 2 } });
}

test.beforeAll(async ({ request }) => {
  const status = await request.get("/api/health").then(
    (response) => response.status(),
    () => 0,
  );
  if (status !== 200) throw new Error("dev server not running on :3001");
});

test.beforeEach(async ({ page }) => {
  // Keeps the first-visit theme note from covering the header.
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, "1");
    } catch {}
  }, POINTER_SEEN_KEY);
  await signIn(page, ORGANIZER);
  // The home page streams in after the loading skeleton and moves the footer down.
  await expect(page.locator('a[href$="/manage"]', { hasText: DENSE_EVENT_NAME }).first()).toBeVisible();
});

test("a. header link comet on hover", async ({ page }) => {
  const link = page.locator("header").getByRole("link", { name: "Availability" });
  await expect.poll(() => animations(link)).not.toContain("comet-lap::after");
  await link.hover();
  await expect.poll(() => animations(link)).toContain("comet-lap::after");
});

test("a. header link comet on keyboard focus", async ({ page }) => {
  const wordmark = page.locator('header a[href="/"]');
  const link = page.locator("header").getByRole("link", { name: "Availability" });
  await wordmark.focus();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await expect.poll(() => animations(link)).toContain("comet-lap::after");
});

test("b. footer link pixel pointer", async ({ page }) => {
  const link = page.locator("footer").getByRole("link", { name: "Privacy" });
  await expect.poll(() => pseudoOpacity(link, "::before")).toBe("0");
  await hoverBox(link);
  await expect.poll(() => pseudoOpacity(link, "::before")).toBe("1");
});

test("c. footer name pawprint", async ({ page }) => {
  const footer = page.locator("footer");
  const name = footer.locator(".name-glow");
  await waitForHydration(name);
  await expect(footer.locator(".paw-cell")).toHaveCount(0);
  await name.hover();
  await expect(name).toHaveAttribute("data-glow", "");
  await expect.poll(() => footer.locator(".paw-cell").count()).toBeGreaterThan(0);
  await page.mouse.move(0, 0);
  await expect(footer.locator(".paw-grid")).toHaveCount(0);
  await expect(name).not.toHaveAttribute("data-glow");
});

test("d. footer label binary decode", async ({ page }) => {
  const link = page.locator("footer").getByRole("link", { name: "Privacy" });
  const overlay = link.locator('span[aria-hidden="true"]');
  await waitForHydration(link.locator("span").first());
  // Records each overlay the label adds; the decode lasts about 0.35 s.
  await link.evaluate((el) => {
    const seen: string[] = [];
    (window as unknown as { decodeSeen: string[] }).decodeSeen = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.getAttribute("aria-hidden") === "true") {
            seen.push(node.textContent ?? "");
          }
        }
      }
    }).observe(el, { childList: true, subtree: true });
  });
  await hoverBox(link);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { decodeSeen: string[] }).decodeSeen[0]))
    .toMatch(/^[01]{7}$/);
  await expect(overlay).toHaveCount(0);
  await expect(link).toHaveText("Privacy");
});

test("e. wordmark letter hop", async ({ page }) => {
  const wordmark = page.locator('header a[href="/"]');
  const hops = async () => (await animations(wordmark)).filter((name) => name === "hop").length;
  await expect.poll(hops).toBe(0);
  await wordmark.hover();
  await expect.poll(hops).toBe("catherder".length);
});

test("f. button sinks while pressed", async ({ page }) => {
  const button = page.locator("header").getByRole("button", { name: "Theme" });
  await waitForHydration(button);
  await expect.poll(() => transformParts(button)).toEqual([1, 0, 0]);
  await button.hover();
  await page.mouse.down();
  await expect.poll(() => transformParts(button)).toEqual([0.985, 0, 1.5]);
  await page.mouse.up();
  await expect.poll(() => transformParts(button)).toEqual([1, 0, 0]);
  // The click opened the theme list; close it again.
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("group", { name: "Themes" })).toHaveCount(0);
});

test("g. theme list switches and restores the theme", async ({ page }) => {
  const html = page.locator("html");
  const button = page.locator("header").getByRole("button", { name: "Theme" });
  const list = page.getByRole("group", { name: "Themes" });
  const original = (await html.getAttribute("data-theme")) as Theme;
  const other = THEMES.find((theme) => theme !== original)!;
  await waitForHydration(button);

  const pick = async (theme: Theme) => {
    await button.click();
    await expect(list).toBeVisible();
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/me/theme") && response.request().method() === "POST",
    );
    await list.getByRole("button", { name: THEME_NAMES[theme], exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(html).toHaveAttribute("data-theme", theme);
  };

  try {
    await button.click();
    await expect(list.getByRole("button")).toHaveCount(THEMES.length);
    for (const theme of THEMES) {
      await expect(list.getByRole("button", { name: THEME_NAMES[theme], exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);

    await pick(other);
    await pick(original);
  } finally {
    if ((await html.getAttribute("data-theme")) !== original) {
      const restored = await page.request.post("/api/me/theme", { data: { theme: original } });
      expect(restored.ok()).toBe(true);
    }
  }
});

test("h. segmented highlight slides", async ({ page }) => {
  await page.goto(`/e/${await denseEventId(page)}/responses`);
  const toggle = page.getByRole("radiogroup", { name: "Grid granularity" });
  const highlight = toggle.locator(".segmented-highlight");
  const half = toggle.getByRole("radio", { name: "Half hour", exact: true });
  const hour = toggle.getByRole("radio", { name: "Hour", exact: true });
  await waitForHydration(half);
  const width = await highlight.evaluate((el) => el.getBoundingClientRect().width);
  const offset = async () => (await transformParts(highlight))[1];

  await expect(hour).toHaveAttribute("aria-checked", "true");
  await expect.poll(offset).toBeCloseTo(width, 0);
  await half.click();
  await expect(half).toHaveAttribute("aria-checked", "true");
  await expect.poll(offset).toBeCloseTo(0, 0);
  await hour.click();
  await expect(hour).toHaveAttribute("aria-checked", "true");
  await expect.poll(offset).toBeCloseTo(width, 0);
});

test("i. event row hover edge", async ({ page }) => {
  const row = page.locator("a.row-edge", { hasText: DENSE_EVENT_NAME }).first();
  await expect.poll(() => pseudoOpacity(row, "::before")).toBe("0");
  await row.hover();
  await expect.poll(() => pseudoOpacity(row, "::before")).toBe("1");
});

test("j. saved tick pops in", async ({ page }) => {
  const manage = `/e/${await denseEventId(page)}/manage`;
  await page.goto(manage);
  const textarea = page.locator("#event-description");
  const form = page.locator("form").filter({ has: textarea });
  const save = form.getByRole("button", { name: "Save", exact: true });
  const unsaved = form.getByText("Unsaved changes");
  const tick = form.locator(".pop-in");
  await waitForHydration(textarea);
  const original = await textarea.inputValue();
  test.info().annotations.push({
    type: "description",
    description: `${original.length} characters before; "${DESCRIPTION_MARK}" appended, then removed`,
  });

  try {
    await textarea.press("Control+End");
    await page.keyboard.type(DESCRIPTION_MARK);
    await expect(textarea).toHaveValue(original + DESCRIPTION_MARK);
    await expect(unsaved).toBeVisible();
    await save.click();
    await expect(unsaved).toHaveCount(0);
    await expect(tick).toBeVisible();
    await expect.poll(() => animations(tick)).toContain("pop");

    await textarea.press("Control+End");
    await page.keyboard.press("Backspace");
    await expect(textarea).toHaveValue(original);
    await expect(unsaved).toBeVisible();
    await save.click();
    await expect(unsaved).toHaveCount(0);
  } finally {
    // Confirms the stored text after a reload and puts it back if a step failed.
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(manage);
    await waitForHydration(textarea);
    if ((await textarea.inputValue()) !== original) {
      await textarea.fill(original);
      await save.click();
      await expect(unsaved).toHaveCount(0);
      await page.goto(manage);
    }
    await expect(textarea).toHaveValue(original);
  }
});

test("k. results panel previews the pointed cell", async ({ page }) => {
  await page.goto(`/e/${await denseEventId(page)}/responses`);
  const cell = page.getByRole("button", { name: /, [1-9]\d* available, / }).first();
  await waitForHydration(cell);
  const label = (await cell.getAttribute("aria-label")) ?? "";
  const title = page.getByText(label.split(",")[0], { exact: true });

  await expect(title).toHaveCount(0);
  await cell.hover();
  await expect(title).toBeVisible();
  await expect(title.locator("..")).toHaveCSS("opacity", "0.8");
  await page.mouse.move(0, 0);
  await expect(title).toHaveCount(0);
});
