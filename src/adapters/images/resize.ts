import sharp from "sharp";
import type { Metadata } from "sharp";

// Largest upload accepted, checked before anything is decoded.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Largest image area decoded, so a small file cannot expand into gigabytes of pixels.
export const MAX_INPUT_PIXELS = 50_000_000;

// Longest side of a stored image, in pixels.
export const MAX_EDGE = 1600;

// WebP quality of a stored image.
export const WEBP_QUALITY = 80;

export type ResizeRefusal = "too-large" | "not-an-image" | "unsupported-type" | "too-many-pixels";

export type ResizeResult =
  | { ok: true; data: Buffer; width: number; height: number }
  | { ok: false; reason: ResizeRefusal };

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

// JPEG, PNG, WebP, GIF, and AVIF (HEIF with AV1); not HEIC, SVG, TIFF or raw.
function acceptedFormat(metadata: Metadata): boolean {
  if (metadata.format === "heif") return metadata.compression === "av1";
  return ACCEPTED_FORMATS.has(metadata.format ?? "");
}

function isPixelLimitError(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}

function decodeRefusal(error: unknown): ResizeResult {
  return { ok: false, reason: isPixelLimitError(error) ? "too-many-pixels" : "not-an-image" };
}

/** An upload as an upright WebP fitted inside MAX_EDGE, first frame only, with no EXIF, XMP or IPTC. */
export async function resizeImage(input: Buffer): Promise<ResizeResult> {
  if (input.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "too-large" };

  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch (error) {
    return decodeRefusal(error);
  }
  if ((metadata.width ?? 0) * (metadata.height ?? 0) > MAX_INPUT_PIXELS) {
    return { ok: false, reason: "too-many-pixels" };
  }
  if (!acceptedFormat(metadata)) return { ok: false, reason: "unsupported-type" };

  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, data, width: info.width, height: info.height };
  } catch (error) {
    // A header that reads but pixels that do not, such as a truncated file.
    return decodeRefusal(error);
  }
}
