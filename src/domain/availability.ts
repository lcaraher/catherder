// Pure standing-availability logic: no framework, adapter, or I/O imports.

// Weekday convention matches the schema: 0 = Monday … 6 = Sunday.
export const WEEKDAY_COUNT = 7;
export const HOURS_PER_DAY = 24;

/** One painted hour cell in the weekly grid. */
export interface AvailabilityCell {
  weekday: number;
  hour: number;
}

/** A contiguous block of hours on one weekday; endHour is exclusive (1–24). */
export interface AvailabilityRange {
  weekday: number;
  startHour: number;
  endHour: number;
}

/** Merges painted cells into per-weekday ranges of adjacent hours. */
export function cellsToRanges(
  cells: Iterable<AvailabilityCell>,
): AvailabilityRange[] {
  const hoursByWeekday = new Map<number, Set<number>>();
  for (const { weekday, hour } of cells) {
    let hours = hoursByWeekday.get(weekday);
    if (!hours) hoursByWeekday.set(weekday, (hours = new Set()));
    hours.add(hour);
  }

  const ranges: AvailabilityRange[] = [];
  for (const weekday of [...hoursByWeekday.keys()].sort((a, b) => a - b)) {
    const hours = [...hoursByWeekday.get(weekday)!].sort((a, b) => a - b);
    let start = hours[0];
    let prev = hours[0];
    for (const hour of hours.slice(1)) {
      if (hour === prev + 1) {
        prev = hour;
        continue;
      }
      ranges.push({ weekday, startHour: start, endHour: prev + 1 });
      start = prev = hour;
    }
    ranges.push({ weekday, startHour: start, endHour: prev + 1 });
  }
  return ranges;
}

/** Expands ranges back into individual hour cells. */
export function rangesToCells(ranges: AvailabilityRange[]): AvailabilityCell[] {
  const cells: AvailabilityCell[] = [];
  for (const range of ranges) {
    for (let hour = range.startHour; hour < range.endHour; hour++) {
      cells.push({ weekday: range.weekday, hour });
    }
  }
  return cells;
}

/**
 * Validates untrusted input as a list of availability ranges. Throws with a
 * human-readable message on the first problem found.
 */
export function validateRanges(value: unknown): AvailabilityRange[] {
  if (!Array.isArray(value)) {
    throw new Error("ranges must be an array");
  }
  const ranges = value.map((item, i): AvailabilityRange => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`ranges[${i}] must be an object`);
    }
    const { weekday, startHour, endHour } = item as Record<string, unknown>;
    if (
      !Number.isInteger(weekday) ||
      (weekday as number) < 0 ||
      (weekday as number) >= WEEKDAY_COUNT
    ) {
      throw new Error(`ranges[${i}].weekday must be an integer 0-6`);
    }
    if (
      !Number.isInteger(startHour) ||
      !Number.isInteger(endHour) ||
      (startHour as number) < 0 ||
      (endHour as number) > HOURS_PER_DAY ||
      (startHour as number) >= (endHour as number)
    ) {
      throw new Error(
        `ranges[${i}] hours must be integers with 0 <= startHour < endHour <= 24`,
      );
    }
    return {
      weekday: weekday as number,
      startHour: startHour as number,
      endHour: endHour as number,
    };
  });

  const sorted = [...ranges].sort(
    (a, b) => a.weekday - b.weekday || a.startHour - b.startHour,
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.weekday === curr.weekday && curr.startHour < prev.endHour) {
      throw new Error("ranges must not overlap within a weekday");
    }
  }
  return ranges;
}

// SQL TIME columns cannot hold 24:00, so a range ending at midnight is stored
// with endLocal 00:00. Because startHour < endHour always holds, an end time
// of 00:00 can only mean midnight-at-end-of-day, so the mapping is unambiguous.

/** Whole hour (0–24) to the Date value Prisma stores in a @db.Time column. */
export function hourToDbTime(hour: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hour % HOURS_PER_DAY, 0, 0));
}

/** Date read from a @db.Time column back to a whole hour (0–24). */
export function dbTimeToHour(time: Date, position: "start" | "end"): number {
  const hour = time.getUTCHours();
  return position === "end" && hour === 0 ? HOURS_PER_DAY : hour;
}

/** True if the value is a time-zone name the JS runtime can resolve. */
export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
