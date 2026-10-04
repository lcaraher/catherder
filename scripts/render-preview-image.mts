import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Renders the link preview image and the Apple icon from the running dev server.
// Run via `npm run render:preview-image` with `npm run dev` running.

const ORIGIN = "http://localhost:3001";
const PREVIEW_URL = `${ORIGIN}/dev-preview-image`;
const PREVIEW_PATH = "src/app/opengraph-image.png";
const ICON_PATH = "src/app/icon.png";
const APPLE_ICON_PATH = "src/app/apple-icon.png";
const APPLE_ICON_SIZE = 180;

// Width and height from a PNG's IHDR chunk.
function pngSize(path: string): string {
  const png = readFileSync(path);
  return `${png.readUInt32BE(16)} × ${png.readUInt32BE(20)}`;
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });

  const response = await page.goto(PREVIEW_URL).catch(() => null);
  if (!response) {
    console.error(`The dev server must be running on ${ORIGIN}.`);
    process.exitCode = 1;
  } else if (!response.ok()) {
    console.error(`${PREVIEW_URL} answered ${response.status()}; it exists only in development.`);
    process.exitCode = 1;
  } else {
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.locator("[data-preview-image]").screenshot({ path: PREVIEW_PATH });

    const iconUrl = `data:image/png;base64,${readFileSync(ICON_PATH).toString("base64")}`;
    const appleIcon = await page.evaluate(
      async ({ src, size }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No 2D canvas context.");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { src: iconUrl, size: APPLE_ICON_SIZE },
    );
    writeFileSync(APPLE_ICON_PATH, Buffer.from(appleIcon, "base64"));

    console.log(`${PREVIEW_PATH} ${pngSize(PREVIEW_PATH)}`);
    console.log(`${APPLE_ICON_PATH} ${pngSize(APPLE_ICON_PATH)}`);
  }
} finally {
  await browser.close();
}
