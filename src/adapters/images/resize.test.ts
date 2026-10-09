import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { MAX_UPLOAD_BYTES, resizeImage } from "./resize.ts";

const RED = { r: 200, g: 40, b: 40 };

function solid(width: number, height: number, channels: 3 | 4 = 3, alpha = 1) {
  return sharp({ create: { width, height, channels, background: { ...RED, alpha } } });
}

async function resized(input: Buffer) {
  const result = await resizeImage(input);
  assert.equal(result.ok, true, `refused: ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error("unreachable");
  return { result, metadata: await sharp(result.data).metadata() };
}

describe("resizeImage", () => {
  it("turns a sideways camera JPEG upright, fits it, and drops its EXIF, XMP and IPTC", async () => {
    const input = await solid(4000, 3000)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Make: "TestCam", Model: "T1", Software: "catherder-test" },
        IFD2: { DateTimeOriginal: "2026:10:09 12:00:00" },
      })
      .toBuffer();
    const before = await sharp(input).metadata();
    assert.equal(before.orientation, 6);
    assert.ok(before.exif);

    const { result, metadata } = await resized(input);
    assert.equal(metadata.format, "webp");
    assert.deepEqual([result.width, result.height], [1200, 1600]);
    assert.deepEqual([metadata.width, metadata.height], [1200, 1600]);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
  });

  it("keeps a small PNG at its own size", async () => {
    const { result } = await resized(await solid(200, 100).png().toBuffer());
    assert.deepEqual([result.width, result.height], [200, 100]);
  });

  it("keeps transparency as an alpha channel", async () => {
    const { metadata } = await resized(await solid(64, 64, 4, 0.5).png().toBuffer());
    assert.equal(metadata.hasAlpha, true);
  });

  it("keeps only the first frame of an animated GIF", async () => {
    const frames = await Promise.all(
      [0, 1, 2].map((n) =>
        sharp({ create: { width: 40, height: 30, channels: 3, background: { r: n * 100, g: 0, b: 0 } } })
          .png()
          .toBuffer(),
      ),
    );
    const gif = await sharp(frames, { join: { animated: true } }).gif().toBuffer();
    assert.equal((await sharp(gif).metadata()).pages, 3);

    const { result, metadata } = await resized(gif);
    assert.ok(metadata.pages === undefined || metadata.pages === 1, `pages: ${metadata.pages}`);
    assert.deepEqual([result.width, result.height], [40, 30]);
  });

  it("accepts an AVIF", async () => {
    const avif = await solid(120, 80).avif().toBuffer();
    const before = await sharp(avif).metadata();
    assert.equal(before.format, "heif");
    assert.equal(before.compression, "av1");
    const { result } = await resized(avif);
    assert.deepEqual([result.width, result.height], [120, 80]);
  });

  it("refuses an image over the pixel limit", async () => {
    const png = await solid(7100, 7100).png().toBuffer();
    assert.ok(png.length < MAX_UPLOAD_BYTES);
    assert.deepEqual(await resizeImage(png), { ok: false, reason: "too-many-pixels" });
  });

  it("refuses an SVG", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
    );
    assert.deepEqual(await resizeImage(svg), { ok: false, reason: "unsupported-type" });
  });

  it("refuses a TIFF", async () => {
    const tiff = await solid(20, 20).tiff().toBuffer();
    assert.deepEqual(await resizeImage(tiff), { ok: false, reason: "unsupported-type" });
  });

  it("refuses bytes that are not an image", async () => {
    const noise = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7919 + 13) % 256));
    assert.deepEqual(await resizeImage(noise), { ok: false, reason: "not-an-image" });
  });

  it("refuses an upload over the size limit before decoding it", async () => {
    // A valid PNG padded past the limit: decoding it would succeed, so a refusal means it was never decoded.
    const png = await solid(10, 10).png().toBuffer();
    const big = Buffer.concat([png, Buffer.alloc(MAX_UPLOAD_BYTES + 1 - png.length)]);
    assert.deepEqual(await resizeImage(big), { ok: false, reason: "too-large" });
  });
});
