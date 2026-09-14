// Pure overlap computation: no framework, adapter, or I/O imports. Slot and
// midnight conventions come from availability.ts — never re-implemented here.

import {
  SLOTS_PER_DAY,
  WEEKDAY_COUNT,
  weekFromRanges,
  type AvailabilityRange,
} from "./availability.ts";

export interface OverlapParticipant {
  userId: string;
  displayName: string;
  isGameMaster: boolean;
  /** IANA zone the participant's ranges are wall-clock local to. */
  timeZone: string;
  ranges: AvailabilityRange[];
}

/** Who is available / tentative in one 30-minute cell, as userIds. */
export interface OverlapCell {
  available: string[];
  tentative: string[];
}

/** grid[weekday][slot], 7 × 48, in the viewer's zone. */
export type OverlapGrid = OverlapCell[][];

export interface OverlapResult {
  grid: OverlapGrid;
  /** userIds whose zone's UTC offset was rounded to the nearest half-hour. */
  approximated: string[];
  /** True when the viewer's own zone offset was rounded the same way. */
  viewerApproximated: boolean;
}

const MINUTES_PER_SLOT = 30;

/**
 * The zone's UTC offset in minutes at the given instant, from
 * Intl.DateTimeFormat — never a hard-coded table.
 */
function utcOffsetMinutes(timeZone: string, at: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  // "GMT" (zero), "GMT+5:30", "GMT-04:00".
  const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(name);
  if (!match) {
    throw new Error(`cannot determine the UTC offset of zone ${timeZone}`);
  }
  if (!match[1]) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? "0"));
}

/**
 * The half-hour slot grid cannot represent offsets like Asia/Kathmandu's
 * +5:45, so they are rounded to the nearest half-hour; +5:45 sits exactly
 * between +5:30 and +6:00 and ties round away from zero, making it +6:00.
 * Callers surface who was approximated instead of this module throwing.
 */
function roundToHalfHour(offsetMinutes: number): number {
  return (
    Math.sign(offsetMinutes) *
    Math.round(Math.abs(offsetMinutes) / MINUTES_PER_SLOT) *
    MINUTES_PER_SLOT
  );
}

/**
 * Weekly availability has no dates, so DST is resolved against one concrete
 * reference week: every zone's offset is sampled at the coming Monday 12:00
 * in the viewer's zone (today, if today is Monday). The instant only feeds
 * offset sampling, so being off by the DST correction hour is immaterial.
 */
function referenceInstant(viewerTimeZone: string, now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: viewerTimeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
    get("weekday"),
  );
  const daysUntilMonday = (WEEKDAY_COUNT - weekdayIndex) % WEEKDAY_COUNT;
  const candidate = new Date(
    Date.UTC(
      Number(get("year")),
      Number(get("month")) - 1,
      Number(get("day")) + daysUntilMonday,
      12,
    ),
  );
  // Shift UTC noon to viewer-local noon using the offset at the candidate.
  return new Date(
    candidate.getTime() - utcOffsetMinutes(viewerTimeZone, candidate) * 60_000,
  );
}

/**
 * Merges every participant's week into one 7 × 48 grid in the viewer's zone.
 * Each participant's slots are shifted by the whole-week slot difference
 * between their UTC offset and the viewer's, so a block that crosses
 * midnight wraps to the adjacent weekday (Sunday late night forward into
 * Monday, Monday early morning back into Sunday). Available and tentative
 * are kept separate and never summed. Offsets that are not whole half-hours
 * are rounded (see roundToHalfHour) and reported in the result.
 */
export function computeOverlapGrid(
  participants: readonly OverlapParticipant[],
  viewerTimeZone: string,
  now: Date = new Date(),
): OverlapResult {
  const reference = referenceInstant(viewerTimeZone, now);
  const exactViewerOffset = utcOffsetMinutes(viewerTimeZone, reference);
  const viewerOffset = roundToHalfHour(exactViewerOffset);
  const viewerApproximated = viewerOffset !== exactViewerOffset;
  const approximated: string[] = [];

  const totalSlots = WEEKDAY_COUNT * SLOTS_PER_DAY;
  const grid: OverlapGrid = Array.from({ length: WEEKDAY_COUNT }, () =>
    Array.from({ length: SLOTS_PER_DAY }, () => ({
      available: [] as string[],
      tentative: [] as string[],
    })),
  );

  for (const participant of participants) {
    const exactOffset = utcOffsetMinutes(participant.timeZone, reference);
    const offset = roundToHalfHour(exactOffset);
    if (offset !== exactOffset) approximated.push(participant.userId);
    // A participant east of the viewer (larger offset) reaches any wall-clock
    // time earlier in absolute terms, so their slots land earlier for the
    // viewer; west of the viewer, later.
    const shiftSlots = (viewerOffset - offset) / MINUTES_PER_SLOT;

    const week = weekFromRanges(participant.ranges);
    week.forEach((day, weekday) =>
      day.forEach((status, slot) => {
        if (status === null) return;
        const shifted =
          (((weekday * SLOTS_PER_DAY + slot + shiftSlots) % totalSlots) +
            totalSlots) %
          totalSlots;
        const cell =
          grid[Math.floor(shifted / SLOTS_PER_DAY)][shifted % SLOTS_PER_DAY];
        (status === "AVAILABLE" ? cell.available : cell.tentative).push(
          participant.userId,
        );
      }),
    );
  }
  return { grid, approximated, viewerApproximated };
}

/**
 * Collapses a half-hour overlap grid to 7 × 24 for Hour mode. Within an
 * hour a participant counts as available only when both half-hours are
 * AVAILABLE, tentative when both halves are painted and at least one is
 * TENTATIVE, and not at all when either half is unpainted.
 */
export function collapseOverlapToHours(grid: OverlapGrid): OverlapGrid {
  return grid.map((day) => {
    const hours: OverlapCell[] = [];
    for (let hour = 0; hour < day.length / 2; hour++) {
      const first = day[hour * 2];
      const second = day[hour * 2 + 1];
      const firstAvailable = new Set(first.available);
      const secondAvailable = new Set(second.available);
      const secondPainted = new Set([...second.available, ...second.tentative]);

      const available: string[] = [];
      const tentative: string[] = [];
      for (const userId of [...first.available, ...first.tentative]) {
        if (!secondPainted.has(userId)) continue;
        if (firstAvailable.has(userId) && secondAvailable.has(userId)) {
          available.push(userId);
        } else {
          tentative.push(userId);
        }
      }
      hours.push({ available, tentative });
    }
    return hours;
  });
}
