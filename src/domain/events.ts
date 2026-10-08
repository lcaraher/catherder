// Pure event rules and limits.

// Size limit for the Markdown event description (a cap, not sanitisation).
export const EVENT_DESCRIPTION_MAX_LENGTH = 10_000;

// The counter shows from this many characters.
export const DESCRIPTION_COUNTER_FROM = 9_000;

export function descriptionCounterVisible(length: number): boolean {
  return length >= DESCRIPTION_COUNTER_FROM;
}
