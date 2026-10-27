// Pure best-times ranking over an overlap grid; slot conventions come from availability.ts.

import {
  formatSlotLabel,
  SLOTS_PER_DAY,
  WEEKDAY_COUNT,
  type ClockFormat,
  type SlotStatus,
} from "./availability.ts";
import type { OverlapGrid } from "./overlap.ts";

/** A counted person who misses the session only by a few unpainted half-hours. */
export interface NearlyFit {
  userId: string;
  /** Week slot indexes (0–335) of the unpainted half-hours. */
  missed: number[];
}

/** One listed start; every id list follows countedIds order. */
export interface BestTime {
  /** Week slot index of the first half-hour: 0 = Monday 00:00 … 335 = Sunday 23:30. */
  start: number;
  can: string[];
  maybe: string[];
  nearly: NearlyFit[];
}

export interface BestTimesOptions {
  /** The people the counts are out of, in display order. */
  countedIds: readonly string[];
  /** Session length in half-hours, 1–16. */
  lengthSlots: number;
  /** Fewest "can" people for a start to be listed, at least 1. */
  minPeople: number;
  /** When set, this person must be AVAILABLE throughout, counted or not. */
  organizerId: string | null;
  /** Most unpainted half-hours that still count as "nearly"; 0 = off. */
  nearlySlots: number;
}

/** The counts sessionFit needs; the rest of BestTimesOptions only filters. */
export type SessionFitOptions = Pick<
  BestTimesOptions,
  "countedIds" | "lengthSlots" | "nearlySlots"
>;

const WEEK_SLOTS = WEEKDAY_COUNT * SLOTS_PER_DAY;

/** One person's status in one week slot. */
function slotStatus(grid: OverlapGrid, userId: string, weekSlot: number): SlotStatus {
  const cell = grid[Math.floor(weekSlot / SLOTS_PER_DAY)][weekSlot % SLOTS_PER_DAY];
  if (cell.available.includes(userId)) return "AVAILABLE";
  return cell.tentative.includes(userId) ? "TENTATIVE" : null;
}

/** The week slots a session from start covers, wrapping from Sunday into Monday. */
function sessionSlots(start: number, lengthSlots: number): number[] {
  return Array.from({ length: lengthSlots }, (_, offset) => (start + offset) % WEEK_SLOTS);
}

/** Who can, maybe and nearly can make exactly this start; no minimum applies. */
export function sessionFit(
  grid: OverlapGrid,
  start: number,
  options: SessionFitOptions,
): BestTime {
  const { countedIds, lengthSlots, nearlySlots } = options;
  const session = sessionSlots(start, lengthSlots);
  const can: string[] = [];
  const maybe: string[] = [];
  const nearly: NearlyFit[] = [];
  for (const userId of countedIds) {
    const statuses = session.map((slot) => slotStatus(grid, userId, slot));
    const missed = session.filter((_, index) => statuses[index] === null);
    if (missed.length === 0) {
      (statuses.every((status) => status === "AVAILABLE") ? can : maybe).push(userId);
    } else if (missed.length <= nearlySlots && missed.length < lengthSlots) {
      nearly.push({ userId, missed });
    }
  }
  return { start, can, maybe, nearly };
}

/**
 * Every start at least minPeople can make, ranked by can, then maybe, then
 * earliest; a session wraps from Sunday into Monday.
 */
export function findBestTimes(
  grid: OverlapGrid,
  options: BestTimesOptions,
): BestTime[] {
  const { lengthSlots, minPeople, organizerId } = options;
  const kept: BestTime[] = [];
  for (let start = 0; start < WEEK_SLOTS; start++) {
    if (
      organizerId !== null &&
      !sessionSlots(start, lengthSlots).every(
        (slot) => slotStatus(grid, organizerId, slot) === "AVAILABLE",
      )
    ) {
      continue;
    }
    const fit = sessionFit(grid, start, options);
    if (fit.can.length >= minPeople) kept.push(fit);
  }

  return kept.sort(compareBestTimes);
}

/** The listing order: most can, then most maybe, then earliest start. */
export function compareBestTimes(a: BestTime, b: BestTime): number {
  return (
    b.can.length - a.can.length ||
    b.maybe.length - a.maybe.length ||
    a.start - b.start
  );
}

/** A shared start in the viewer's zone, with the length it was shared for. */
export interface SharedStart {
  start: number;
  lengthSlots: number;
}

/** A shared time's fit at its own length. */
export interface SharedTimeFit extends BestTime {
  lengthSlots: number;
}

/** Each shared start's fit at its own length, with no nearly, ranked as findBestTimes ranks. */
export function fitSharedTimes(
  grid: OverlapGrid,
  shared: readonly SharedStart[],
  countedIds: readonly string[],
): SharedTimeFit[] {
  return shared
    .map(({ start, lengthSlots }) => ({
      ...sessionFit(grid, start, { countedIds, lengthSlots, nearlySlots: 0 }),
      lengthSlots,
    }))
    .sort(compareBestTimes);
}

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** "7:00 PM–10:00 PM" for length slots from a slot of the day; past midnight the end wraps. */
function spanLabel(slotOfDay: number, length: number, clockFormat: ClockFormat): string {
  const end = slotOfDay + length;
  const endOfDay = end > SLOTS_PER_DAY ? end - SLOTS_PER_DAY : end;
  return `${formatSlotLabel(slotOfDay, clockFormat)}–${formatSlotLabel(endOfDay, clockFormat)}`;
}

/** "Saturday 7:00 PM–10:00 PM": the start's weekday only, even past midnight. */
export function sessionLabel(
  start: number,
  lengthSlots: number,
  clockFormat: ClockFormat,
): string {
  const weekday = WEEKDAY_NAMES[Math.floor(start / SLOTS_PER_DAY)];
  return `${weekday} ${spanLabel(start % SLOTS_PER_DAY, lengthSlots, clockFormat)}`;
}

/** Missed week slots as spans of consecutive half-hours, joined by " and ". */
export function missedLabel(missed: readonly number[], clockFormat: ClockFormat): string {
  const spans: { start: number; length: number }[] = [];
  for (const slot of missed) {
    const last = spans[spans.length - 1];
    if (last && (last.start + last.length) % WEEK_SLOTS === slot) last.length++;
    else spans.push({ start: slot, length: 1 });
  }
  return spans
    .map(({ start, length }) => spanLabel(start % SLOTS_PER_DAY, length, clockFormat))
    .join(" and ");
}

/** Half-hours as a number of hours, e.g. 5 -> "2.5". */
function hours(slots: number): string {
  return String(slots / 2);
}

/** "30-minute", "1-hour", "2.5-hour". */
export function lengthLabel(slots: number): string {
  return slots === 1 ? "30-minute" : `${hours(slots)}-hour`;
}

/** "30 minutes", "1 hour", "2.5 hours". */
export function hoursLabel(slots: number): string {
  if (slots === 1) return "30 minutes";
  return slots === 2 ? "1 hour" : `${hours(slots)} hours`;
}
