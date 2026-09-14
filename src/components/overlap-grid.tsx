"use client";

import { useMemo, useState } from "react";
import {
  formatSlotLabel,
  SLOTS_PER_DAY,
  type ClockFormat,
} from "@/domain/availability";
import {
  collapseOverlapToHours,
  splitGm,
  type OverlapGrid,
  type SplitOverlapCell,
} from "@/domain/overlap";
import { GmBadge } from "@/components/gm-badge";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// The heat scale colours by available count only (clamped to 5); tentative
// never colours a cell. Static list so Tailwind sees every class.
const HEAT_CLASSES = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
  "bg-heat-5",
];

// The GM mark is a border, not colour alone: solid for available, dashed for
// tentative. Static strings so Tailwind sees every class.
const GM_MARK_CLASSES = {
  AVAILABLE: "border-2 border-solid border-gm-mark",
  TENTATIVE: "border-2 border-dashed border-gm-mark",
} as const;

export interface OverlapPerson {
  userId: string;
  displayName: string;
  isGameMaster: boolean;
  timeZone: string;
}

interface Props {
  /** 7 × 48 half-hour grid in the viewer's zone, from computeOverlapGrid. */
  grid: OverlapGrid;
  people: OverlapPerson[];
  /**
   * The event's GameMaster, or null (SINGLE_ACTIVITY). With a GM the printed
   * numbers are players only and the GM is shown as a cell mark instead.
   */
  gmUserId: string | null;
  /** Whether the GM has any availability rows for this event. */
  gmHasAvailability: boolean;
  /** The viewer's clock format, passed down from the page — never read here. */
  clockFormat: ClockFormat;
}

type Granularity = "half" | "hour";

/**
 * Read-only overlap heat map: the availability grid's 7-column layout and
 * Half hour / Hour toggle, with counts printed in each cell. Cells are
 * buttons; selecting one lists who is available and tentative in it below
 * the grid — no hover-only information. In GM_GROUPS events the GM is the
 * anchor: split out of the counts, marked with a border, and filterable via
 * "Only times the GM can make".
 */
export function OverlapGridView({
  grid,
  people,
  gmUserId,
  gmHasAvailability,
  clockFormat,
}: Props) {
  const [granularity, setGranularity] = useState<Granularity>("half");
  const [gmOnly, setGmOnly] = useState(false);
  const [selected, setSelected] = useState<{
    weekday: number;
    row: number;
  } | null>(null);

  const splitGrid = useMemo(() => splitGm(grid, gmUserId), [grid, gmUserId]);
  const hourGrid = useMemo(
    () => collapseOverlapToHours(splitGrid),
    [splitGrid],
  );
  const shownGrid = granularity === "half" ? splitGrid : hourGrid;
  const rowCount = granularity === "half" ? SLOTS_PER_DAY : 24;
  const slotsPerRow = granularity === "half" ? 1 : 2;

  const personById = useMemo(
    () => new Map(people.map((person) => [person.userId, person])),
    [people],
  );
  const gm = gmUserId === null ? null : (personById.get(gmUserId) ?? null);

  const rowSpan = (row: number): string =>
    `${formatSlotLabel(row * slotsPerRow, clockFormat)}–${formatSlotLabel((row + 1) * slotsPerRow, clockFormat)}`;

  const selectedCell: SplitOverlapCell | null =
    selected === null ? null : shownGrid[selected.weekday][selected.row];

  function renderNames(userIds: string[], gmStatus?: "AVAILABLE" | "TENTATIVE") {
    return (
      <ul className="flex flex-col gap-0.5">
        {gmStatus && gm && (
          <li className="flex items-center gap-2">
            <span
              className={`inline-block h-3 w-3 shrink-0 rounded-sm ${GM_MARK_CLASSES[gmStatus]}`}
              aria-hidden="true"
            />
            <span>{gm.displayName}</span>
            <GmBadge />
            <span className="text-xs text-hint">{gm.timeZone}</span>
          </li>
        )}
        {userIds.map((userId) => {
          const person = personById.get(userId);
          if (!person) return null;
          return (
            <li key={userId} className="flex items-center gap-2">
              <span>{person.displayName}</span>
              {person.isGameMaster && <GmBadge />}
              <span className="text-xs text-hint">{person.timeZone}</span>
            </li>
          );
        })}
        {userIds.length === 0 && !gmStatus && (
          <li className="text-hint">Nobody.</li>
        )}
      </ul>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          className="inline-flex overflow-hidden rounded border border-edge-strong text-sm"
          role="radiogroup"
          aria-label="Grid granularity"
        >
          {(
            [
              ["half", "Half hour"],
              ["hour", "Hour"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={granularity === value}
              onClick={() => {
                setGranularity(value);
                setSelected(null);
              }}
              className={`px-3 py-1 ${
                granularity === value
                  ? "bg-toggle-active text-toggle-active-text"
                  : "hover:bg-btn-secondary-hover"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {gmUserId !== null && (
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gmOnly}
                disabled={!gmHasAvailability}
                onChange={(e) => {
                  setGmOnly(e.target.checked);
                  setSelected(null);
                }}
              />
              Only times the GM can make
            </label>
            {!gmHasAvailability && (
              <span className="text-xs text-hint">
                The GM has not set their availability for this event
              </span>
            )}
          </div>
        )}
      </div>

      {gmUserId !== null && (
        <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3.5 w-3.5 rounded-sm ${GM_MARK_CLASSES.AVAILABLE}`}
            />
            GM available (numbers count players only)
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3.5 w-3.5 rounded-sm ${GM_MARK_CLASSES.TENTATIVE}`}
            />
            GM tentative
          </li>
        </ul>
      )}

      <div className="grid select-none grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-px rounded border border-grid-line bg-grid-line">
        <div className="bg-surface-card" />
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="bg-surface-card py-1 text-center text-xs font-medium text-muted"
          >
            {label}
          </div>
        ))}
        {Array.from({ length: rowCount }, (_, row) => {
          const showLabel = granularity === "hour" || row % 2 === 0;
          return (
            <div key={row} className="contents">
              <div
                className={`flex items-center justify-end bg-surface-card pr-2 text-[10px] text-grid-label ${
                  granularity === "half" ? "h-4" : "h-6"
                }`}
              >
                {showLabel
                  ? formatSlotLabel(row * slotsPerRow, clockFormat)
                  : ""}
              </div>
              {WEEKDAY_LABELS.map((_, weekday) => {
                const cell = shownGrid[weekday][row];
                const height = granularity === "half" ? "h-4" : "h-6";

                // GM filter: cells outside the GM's availability go blank.
                if (gmOnly && cell.gm === null) {
                  return (
                    <div
                      key={weekday}
                      role="img"
                      aria-label={`${WEEKDAY_NAMES[weekday]} ${rowSpan(row)}, outside GM availability`}
                      className={`bg-heat-0 ${height}`}
                    />
                  );
                }

                const availableCount = cell.players.available.length;
                const tentativeCount = cell.players.tentative.length;
                const heat =
                  HEAT_CLASSES[Math.min(availableCount, HEAT_CLASSES.length - 1)];
                const gmMark = cell.gm ? GM_MARK_CLASSES[cell.gm] : "";
                const gmLabel =
                  cell.gm === "AVAILABLE"
                    ? ", GM available"
                    : cell.gm === "TENTATIVE"
                      ? ", GM tentative"
                      : "";
                const isSelected =
                  selected?.weekday === weekday && selected.row === row;
                return (
                  <button
                    key={weekday}
                    type="button"
                    onClick={() =>
                      setSelected(isSelected ? null : { weekday, row })
                    }
                    aria-pressed={isSelected}
                    aria-label={`${WEEKDAY_NAMES[weekday]} ${rowSpan(row)}, ${availableCount} available, ${tentativeCount} tentative${gmLabel}`}
                    className={`flex items-center justify-center text-[10px] leading-none text-heat-text ${heat} ${gmMark} ${height} ${isSelected ? "outline-2 -outline-offset-2 outline-ring" : ""}`}
                  >
                    {availableCount === 0 && tentativeCount === 0
                      ? ""
                      : `${availableCount} · ${tentativeCount}`}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {selected !== null && selectedCell !== null && (
        <div className="mt-3 rounded border border-edge p-3 text-sm">
          <p className="mb-2 font-medium">
            {WEEKDAY_NAMES[selected.weekday]} {rowSpan(selected.row)}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-10">
            <div>
              <p className="mb-1 text-xs text-muted">
                Available ({selectedCell.players.available.length})
              </p>
              {renderNames(
                selectedCell.players.available,
                selectedCell.gm === "AVAILABLE" ? "AVAILABLE" : undefined,
              )}
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">
                Tentative ({selectedCell.players.tentative.length})
              </p>
              {renderNames(
                selectedCell.players.tentative,
                selectedCell.gm === "TENTATIVE" ? "TENTATIVE" : undefined,
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
