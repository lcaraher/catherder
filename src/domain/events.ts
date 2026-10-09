// Pure event rules and limits.

import { isBlankMarkdown } from "./short-description.ts";

// Size limit for the Markdown event description (a cap, not sanitisation).
export const EVENT_DESCRIPTION_MAX_LENGTH = 10_000;

// The counter shows from this many characters.
export const DESCRIPTION_COUNTER_FROM = 9_000;

export function descriptionCounterVisible(length: number): boolean {
  return length >= DESCRIPTION_COUNTER_FROM;
}

// Whether readers have a description to read; blank counts as none.
export function hasDescription(description: string | null): boolean {
  return description !== null && !isBlankMarkdown(description);
}
