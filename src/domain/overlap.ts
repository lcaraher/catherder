// Pure overlap computation; slot and midnight conventions come from availability.ts.

import {
  SLOTS_PER_DAY,
  WEEKDAY_COUNT,
  weekFromRanges,
  type AvailabilityRange,
} from "./availability.ts";

export interface OverlapParticipant {
  userId: string;
  displayName: string;
  isOrganizer: boolean;
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

/** The zone's UTC offset in minutes at the given instant, via Intl.DateTimeFormat. */
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
 * Rounds an offset to the nearest half-hour; ties round away from zero
 * (+5:45 becomes +6:00). Callers report who was approximated.
 */
function roundToHalfHour(offsetMinutes: number): number {
  return (
    Math.sign(offsetMinutes) *
    Math.round(Math.abs(offsetMinutes) / MINUTES_PER_SLOT) *
    MINUTES_PER_SLOT
  );
}

/**
 * Weekly availability has no dates, so every zone's offset is sampled at the
 * coming Monday 12:00 in the viewer's zone (today, if today is Monday).
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
 * Merges every participant's week into one 7 × 48 grid in the viewer's zone;
 * a block that crosses midnight wraps to the adjacent weekday.
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
    // East of the viewer lands earlier in the viewer's grid; west, later.
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
 * The organizer's slice of a cell after splitOrganizer, as a single status;
 * null = not painted there, or no organizer.
 */
export type OrganizerSlotStatus = "AVAILABLE" | "TENTATIVE" | null;

/** One cell with the organizer reported separately from the counts. */
export interface SplitOverlapCell {
  players: OverlapCell;
  organizer: OrganizerSlotStatus;
}

/** grid[weekday][slot] with the organizer split out of every cell. */
export type SplitOverlapGrid = SplitOverlapCell[][];

/**
 * Reports the organizer's status separately in every cell; with
 * countOrganizer false their id is also removed from the counts. Pure.
 */
export function splitOrganizer(
  grid: OverlapGrid,
  organizerUserId: string | null,
  countOrganizer: boolean,
): SplitOverlapGrid {
  return grid.map((day) =>
    day.map((cell) => {
      const organizer: OrganizerSlotStatus =
        organizerUserId === null
          ? null
          : cell.available.includes(organizerUserId)
            ? "AVAILABLE"
            : cell.tentative.includes(organizerUserId)
              ? "TENTATIVE"
              : null;
      const keep = countOrganizer || organizerUserId === null;
      return {
        players: {
          available: keep
            ? [...cell.available]
            : cell.available.filter((id) => id !== organizerUserId),
          tentative: keep
            ? [...cell.tentative]
            : cell.tentative.filter((id) => id !== organizerUserId),
        },
        organizer,
      };
    }),
  );
}

/** The hour-collapse rule for one pair of half-hour cells. */
function collapseCellPair(first: OverlapCell, second: OverlapCell): OverlapCell {
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
  return { available, tentative };
}

/** The same both-halves rule applied to the organizer's single status. */
function collapseOrganizerPair(
  first: OrganizerSlotStatus,
  second: OrganizerSlotStatus,
): OrganizerSlotStatus {
  if (first === null || second === null) return null;
  return first === "AVAILABLE" && second === "AVAILABLE"
    ? "AVAILABLE"
    : "TENTATIVE";
}

/**
 * Collapses to 7 × 24: available needs both half-hours AVAILABLE, tentative
 * needs both painted; the organizer follows the same both-halves rule.
 */
export function collapseOverlapToHours(grid: OverlapGrid): OverlapGrid;
export function collapseOverlapToHours(grid: SplitOverlapGrid): SplitOverlapGrid;
export function collapseOverlapToHours(
  grid: OverlapGrid | SplitOverlapGrid,
): OverlapGrid | SplitOverlapGrid {
  const isSplit = (
    cell: OverlapCell | SplitOverlapCell,
  ): cell is SplitOverlapCell => "players" in cell;

  return grid.map((day) => {
    const hours: (OverlapCell | SplitOverlapCell)[] = [];
    for (let hour = 0; hour < day.length / 2; hour++) {
      const first = day[hour * 2];
      const second = day[hour * 2 + 1];
      if (isSplit(first) && isSplit(second)) {
        hours.push({
          players: collapseCellPair(first.players, second.players),
          organizer: collapseOrganizerPair(first.organizer, second.organizer),
        });
      } else if (!isSplit(first) && !isSplit(second)) {
        hours.push(collapseCellPair(first, second));
      }
    }
    return hours;
  }) as OverlapGrid | SplitOverlapGrid;
}

export type HeatStep = 0 | 1 | 2 | 3 | 4 | 5;

/** The heat step for a cell: the available count as a fifth of the counted group. */
export function heatStep(available: number, counted: number): HeatStep {
  if (available <= 0 || counted <= 0) return 0;
  const step = Math.ceil((available * 5) / counted);
  return Math.min(5, Math.max(1, step)) as HeatStep;
}

/**
 * The available counts behind each step, indexed by step: "3–4", a single
 * count, or "—" for a step no count reaches. Step 0 is blank.
 */
export function heatRanges(counted: number): string[] {
  const ranges = [""];
  for (let step = 1; step <= 5; step++) {
    const counts: number[] = [];
    for (let available = 1; available <= counted; available++) {
      if (heatStep(available, counted) === step) counts.push(available);
    }
    const low = counts[0];
    const high = counts[counts.length - 1];
    ranges.push(
      counts.length === 0 ? "—" : low === high ? `${low}` : `${low}–${high}`,
    );
  }
  return ranges;
}
