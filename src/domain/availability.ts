// Pure standing-availability logic: no framework, adapter, or I/O imports.

// Weekday convention matches the schema: 0 = Monday … 6 = Sunday.
export const WEEKDAY_COUNT = 7;
// 30-minute slots; slot 0 starts at 00:00, slot 47 at 23:30. As a range end,
// slot 48 means midnight at the end of the day.
export const SLOTS_PER_DAY = 48;
export const SLOT_MINUTES = 30;

export type AvailabilityStatus = "AVAILABLE" | "TENTATIVE";
export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = [
  "AVAILABLE",
  "TENTATIVE",
];

/** One 30-minute cell in the weekly grid, with its state. */
export interface AvailabilityCell {
  weekday: number;
  slot: number;
  status: AvailabilityStatus;
}

/**
 * A contiguous block of same-status slots on one weekday; endSlot is
 * exclusive (1–48).
 */
export interface AvailabilityRange {
  weekday: number;
  startSlot: number;
  endSlot: number;
  status: AvailabilityStatus;
}

/**
 * Merges cells into per-weekday ranges. Only contiguous slots with the same
 * status merge; an AVAILABLE block next to a TENTATIVE block stays two
 * ranges. For duplicate slots the last status wins.
 */
export function cellsToRanges(
  cells: Iterable<AvailabilityCell>,
): AvailabilityRange[] {
  const byWeekday = new Map<number, Map<number, AvailabilityStatus>>();
  for (const { weekday, slot, status } of cells) {
    let slots = byWeekday.get(weekday);
    if (!slots) byWeekday.set(weekday, (slots = new Map()));
    slots.set(slot, status);
  }

  const ranges: AvailabilityRange[] = [];
  for (const weekday of [...byWeekday.keys()].sort((a, b) => a - b)) {
    const slotMap = byWeekday.get(weekday)!;
    const slots = [...slotMap.keys()].sort((a, b) => a - b);
    let start = slots[0];
    let prev = slots[0];
    for (const slot of slots.slice(1)) {
      if (slot === prev + 1 && slotMap.get(slot) === slotMap.get(start)) {
        prev = slot;
        continue;
      }
      ranges.push({
        weekday,
        startSlot: start,
        endSlot: prev + 1,
        status: slotMap.get(start)!,
      });
      start = prev = slot;
    }
    ranges.push({
      weekday,
      startSlot: start,
      endSlot: prev + 1,
      status: slotMap.get(start)!,
    });
  }
  return ranges;
}

/** Expands ranges back into individual slot cells. */
export function rangesToCells(ranges: AvailabilityRange[]): AvailabilityCell[] {
  const cells: AvailabilityCell[] = [];
  for (const range of ranges) {
    for (let slot = range.startSlot; slot < range.endSlot; slot++) {
      cells.push({ weekday: range.weekday, slot, status: range.status });
    }
  }
  return cells;
}

/**
 * Validates untrusted input as a list of availability ranges. Throws with a
 * human-readable message on the first problem found. Overlaps within a
 * weekday are rejected regardless of status: a slot cannot hold two states.
 */
export function validateRanges(value: unknown): AvailabilityRange[] {
  if (!Array.isArray(value)) {
    throw new Error("ranges must be an array");
  }
  const ranges = value.map((item, i): AvailabilityRange => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`ranges[${i}] must be an object`);
    }
    const { weekday, startSlot, endSlot, status } = item as Record<
      string,
      unknown
    >;
    if (
      !Number.isInteger(weekday) ||
      (weekday as number) < 0 ||
      (weekday as number) >= WEEKDAY_COUNT
    ) {
      throw new Error(`ranges[${i}].weekday must be an integer 0-6`);
    }
    if (
      !Number.isInteger(startSlot) ||
      !Number.isInteger(endSlot) ||
      (startSlot as number) < 0 ||
      (endSlot as number) > SLOTS_PER_DAY ||
      (startSlot as number) >= (endSlot as number)
    ) {
      throw new Error(
        `ranges[${i}] slots must be integers with 0 <= startSlot < endSlot <= 48`,
      );
    }
    if (!AVAILABILITY_STATUSES.includes(status as AvailabilityStatus)) {
      throw new Error(`ranges[${i}].status must be AVAILABLE or TENTATIVE`);
    }
    return {
      weekday: weekday as number,
      startSlot: startSlot as number,
      endSlot: endSlot as number,
      status: status as AvailabilityStatus,
    };
  });

  const sorted = [...ranges].sort(
    (a, b) => a.weekday - b.weekday || a.startSlot - b.startSlot,
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.weekday === curr.weekday && curr.startSlot < prev.endSlot) {
      throw new Error("ranges must not overlap within a weekday");
    }
  }
  return ranges;
}

// ---------------------------------------------------------------------------
// Cell state transitions (shared by the grid UI, React-free so it's testable).

/** A slot's state in the editor; null means not available / unpainted. */
export type SlotStatus = AvailabilityStatus | null;

/** Click cycle: empty → available → tentative → empty. */
export function cycleStatus(status: SlotStatus): SlotStatus {
  if (status === null) return "AVAILABLE";
  if (status === "AVAILABLE") return "TENTATIVE";
  return null;
}

/**
 * Hour-mode collapse rule: an hour cell shows one state when both of its
 * half-hour slots agree, and "MIXED" otherwise. Clicking treats MIXED as
 * empty, so cycleStatus(collapse === "MIXED" ? null : collapse) makes the
 * next click set both slots to AVAILABLE.
 */
export function collapseHourCell(
  first: SlotStatus,
  second: SlotStatus,
): SlotStatus | "MIXED" {
  return first === second ? first : "MIXED";
}

// ---------------------------------------------------------------------------
// Time formatting and DB TIME mapping.

/** Slot boundary (0–48) as a wall-clock label, e.g. 19 -> "09:30". */
export function slotLabel(slot: number): string {
  const hours = Math.floor(slot / 2);
  const minutes = slot % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

// SQL TIME columns cannot hold 24:00, so a range ending at midnight (slot 48)
// is stored with endLocal 00:00. Because startSlot < endSlot always holds, an
// end time of 00:00 can only mean midnight-at-end-of-day, so the mapping is
// unambiguous.

/** Slot boundary (0–48) to the Date value Prisma stores in a @db.Time column. */
export function slotToDbTime(slot: number): Date {
  const normalized = slot % SLOTS_PER_DAY;
  return new Date(
    Date.UTC(1970, 0, 1, Math.floor(normalized / 2), (normalized % 2) * 30, 0),
  );
}

/** Date read from a @db.Time column back to a slot boundary (0–48). */
export function dbTimeToSlot(time: Date, position: "start" | "end"): number {
  const slot = time.getUTCHours() * 2 + (time.getUTCMinutes() >= 30 ? 1 : 0);
  return position === "end" && slot === 0 ? SLOTS_PER_DAY : slot;
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
