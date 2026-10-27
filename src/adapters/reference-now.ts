// The "now" pages compute from; fixable outside production via OVERLAP_REFERENCE_DATE.

let warned = false;

/** Clears the one-time warning flag so tests can observe it again. */
export function resetReferenceNowForTests(): void {
  warned = false;
}

// A YYYY-MM-DD calendar date as that day at 12:00 UTC, or null.
function parseReferenceDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const sameDay =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return sameDay ? date : null;
}

/** OVERLAP_REFERENCE_DATE at 12:00 UTC outside production when valid; otherwise the current time. */
export function referenceNow(): Date {
  const value = process.env.OVERLAP_REFERENCE_DATE;
  if (process.env.NODE_ENV === "production" || !value) return new Date();
  const date = parseReferenceDate(value);
  if (date) return date;
  if (!warned) {
    warned = true;
    console.warn("OVERLAP_REFERENCE_DATE is not a valid YYYY-MM-DD date; using the current time");
  }
  return new Date();
}
