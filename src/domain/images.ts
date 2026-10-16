// Pure rules for pictures in an event's description.

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

// Picture types an upload may be: JPEG, PNG, WebP, GIF and AVIF.
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

// Largest upload, 10 MB; the resize function refuses anything bigger with the same limit.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Pictures one event may hold.
export const IMAGES_PER_EVENT = 20;

// Uploads one person may start across all events, counted over the last 24 hours.
export const UPLOADS_PER_DAY = 30;

// The span UPLOADS_PER_DAY is counted over.
export const UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

// Age before an unused picture is removed, so one uploaded but not yet saved survives.
export const UNUSED_IMAGE_GRACE_MS = 24 * 60 * 60 * 1000;

// How long the editor waits for an upload to become ready.
export const READY_WAIT_MS = 30 * 1000;

/** Why an upload request is refused before anything is uploaded. */
export type UploadRefusal = "type" | "size" | "per-event" | "per-day" | "unavailable" | "timed-out";

const parser = unified().use(remarkParse).use(remarkGfm);

const IMAGE_URL = /^img:([a-z0-9]{1,40})$/;

interface MarkdownNode {
  type: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
}

/** Ids of the pictures the Markdown shows: img:<id> images, inline or by reference. */
export function referencedImageIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  const definitions = new Map<string, string>();
  const references: string[] = [];
  const visit = (node: MarkdownNode) => {
    if (node.type === "image") {
      const match = IMAGE_URL.exec(node.url ?? "");
      if (match) ids.add(match[1]);
    } else if (node.type === "imageReference" && node.identifier) {
      references.push(node.identifier);
    } else if (node.type === "definition" && node.identifier && !definitions.has(node.identifier)) {
      // The first definition of a label wins, as in CommonMark.
      definitions.set(node.identifier, node.url ?? "");
    }
    node.children?.forEach(visit);
  };
  visit(parser.parse(markdown) as MarkdownNode);
  for (const identifier of references) {
    const match = IMAGE_URL.exec(definitions.get(identifier) ?? "");
    if (match) ids.add(match[1]);
  }
  return ids;
}

/** How wide a picture is drawn; kept in its Markdown image title. */
export type PictureSize = "small" | "medium" | "large";

/** A picture's size from its title: exactly "small" or "medium", anything else large. */
export function pictureSize(title: string | null | undefined): PictureSize {
  return title === "small" || title === "medium" ? title : "large";
}

/** The title that keeps a size; large keeps none. */
export function sizeTitle(size: PictureSize): string {
  return size === "large" ? "" : size;
}

/** Where the app serves a picture. */
export function imageAddress(eventId: string, imageId: string): string {
  return `/e/${eventId}/images/${imageId}`;
}

// Placeholder wording until the group 7 wording pass.
const MESSAGES = new Map<string, string>([
  ["type", "That file isn't a picture catherder can use. Choose a JPEG, PNG, WebP, GIF or AVIF."],
  ["size", "That picture is over 10 MB. Choose a smaller one."],
  ["too-large", "That picture is over 10 MB. Choose a smaller one."],
  ["not-an-image", "That file couldn't be read as a picture. Choose another."],
  ["unsupported-type", "That file isn't a picture catherder can use. Choose a JPEG, PNG, WebP, GIF or AVIF."],
  ["too-many-pixels", "That picture has too many pixels (over 50 million). Choose a smaller one."],
  ["per-event", "This event has reached its limit of 20 pictures."],
  ["per-day", "You've uploaded 30 pictures today. Try again tomorrow."],
  ["unavailable", "Pictures can't be uploaded right now."],
  ["timed-out", "The picture took too long to get ready. Try again in a moment."],
]);

/** Words for an upload refusal or a resize refusal; an unknown reason reads as an unreadable file. */
export function refusalMessage(reason: string): string {
  return MESSAGES.get(reason) ?? (MESSAGES.get("not-an-image") as string);
}
