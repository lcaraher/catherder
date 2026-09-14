"use client";

import { useMemo, useState } from "react";
import { SLOTS_PER_DAY, slotLabel } from "@/domain/availability";
import {
  collapseOverlapToHours,
  type OverlapCell,
  type OverlapGrid,
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
}

type Granularity = "half" | "hour";

/**
 * Read-only overlap heat map: the availability grid's 7-column layout and
 * Half hour / Hour toggle, with counts printed in each cell. Cells are
 * buttons; selecting one lists who is available and tentative in it below
 * the grid — no hover-only information.
 */
export function OverlapGridView({ grid, people }: Props) {
  const [granularity, setGranularity] = useState<Granularity>("half");
  const [selected, setSelected] = useState<{
    weekday: number;
    row: number;
  } | null>(null);

  const hourGrid = useMemo(() => collapseOverlapToHours(grid), [grid]);
  const shownGrid = granularity === "half" ? grid : hourGrid;
  const rowCount = granularity === "half" ? SLOTS_PER_DAY : 24;
  const slotsPerRow = granularity === "half" ? 1 : 2;

  const personById = useMemo(
    () => new Map(people.map((person) => [person.userId, person])),
    [people],
  );

  const rowSpan = (row: number): string =>
    `${slotLabel(row * slotsPerRow)}–${slotLabel((row + 1) * slotsPerRow)}`;

  const selectedCell: OverlapCell | null =
    selected === null ? null : shownGrid[selected.weekday][selected.row];

  function renderNames(userIds: string[]) {
    return (
      <ul className="flex flex-col gap-0.5">
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
        {userIds.length === 0 && <li className="text-hint">Nobody.</li>}
      </ul>
    );
  }

  return (
    <div>
      <div
        className="mb-3 inline-flex overflow-hidden rounded border border-edge-strong text-sm"
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
                {showLabel ? slotLabel(row * slotsPerRow) : ""}
              </div>
              {WEEKDAY_LABELS.map((_, weekday) => {
                const cell = shownGrid[weekday][row];
                const availableCount = cell.available.length;
                const tentativeCount = cell.tentative.length;
                const heat =
                  HEAT_CLASSES[Math.min(availableCount, HEAT_CLASSES.length - 1)];
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
                    aria-label={`${WEEKDAY_NAMES[weekday]} ${rowSpan(row)}, ${availableCount} available, ${tentativeCount} tentative`}
                    className={`flex items-center justify-center text-[10px] leading-none text-heat-text ${heat} ${
                      granularity === "half" ? "h-4" : "h-6"
                    } ${isSelected ? "outline-2 -outline-offset-2 outline-ring" : ""}`}
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
                Available ({selectedCell.available.length})
              </p>
              {renderNames(selectedCell.available)}
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">
                Tentative ({selectedCell.tentative.length})
              </p>
              {renderNames(selectedCell.tentative)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
