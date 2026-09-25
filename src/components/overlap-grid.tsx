"use client";

import { useMemo, useState } from "react";
import {
  formatSlotLabel,
  SLOTS_PER_DAY,
  type ClockFormat,
} from "@/domain/availability";
import {
  collapseOverlapToHours,
  heatStep,
  splitOrganizer,
  type OverlapGrid,
  type SplitOverlapCell,
} from "@/domain/overlap";
import { HEAT_CLASSES, HEAT_TEXT_CLASSES } from "@/components/heat-legend";
import { Checkbox } from "@/components/form-controls";
import { OrganizerBadge } from "@/components/organizer-badge";
import { Legend } from "@/components/legend";
import { Segmented } from "@/components/segmented";
import { ZoneChip } from "@/components/zone-chip";

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

// Organizer mark: solid border for available, dashed for tentative. Static
// strings so Tailwind sees every class.
const ORGANIZER_MARK_CLASSES = {
  AVAILABLE: "border-2 border-solid border-organizer-mark",
  TENTATIVE: "border-2 border-dashed border-organizer-mark",
} as const;

export interface OverlapPerson {
  userId: string;
  displayName: string;
  isOrganizer: boolean;
  timeZone: string;
  approximated?: boolean;
}

interface Props {
  /** 7 × 48 half-hour grid in the viewer's zone, from computeOverlapGrid. */
  grid: OverlapGrid;
  people: OverlapPerson[];
  /** The event's Organizer, or null on legacy rows without one. */
  organizerUserId: string | null;
  /** Whether the organizer has any availability rows for this event. */
  organizerHasAvailability: boolean;
  /**
   * When true the numbers include the organizer; when false they appear
   * only as the anchor mark.
   */
  countOrganizer: boolean;
  /** Submitted responses among the counted people; 0 leaves empty cells blank. */
  submittedCount: number;
  /** The viewer's clock format, passed down from the page — never read here. */
  clockFormat: ClockFormat;
}

type Granularity = "half" | "hour";

/**
 * Read-only overlap heat map with per-cell counts; selecting a cell lists
 * who is available, tentative, and not available in it.
 */
export function OverlapGridView({
  grid,
  people,
  organizerUserId,
  organizerHasAvailability,
  countOrganizer,
  submittedCount,
  clockFormat,
}: Props) {
  // Hour mode everywhere by default, matching the editors.
  const [granularity, setGranularity] = useState<Granularity>("hour");
  const [organizerOnly, setOrganizerOnly] = useState(false);
  const [selected, setSelected] = useState<{
    weekday: number;
    row: number;
  } | null>(null);

  const splitGrid = useMemo(
    () => splitOrganizer(grid, organizerUserId, countOrganizer),
    [grid, organizerUserId, countOrganizer],
  );
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
  const organizer =
    organizerUserId === null ? null : (personById.get(organizerUserId) ?? null);
  // Who belongs in the selected-cell panel's groups: everyone when the
  // organizer is counted, participants only when they are just the anchor.
  const panelPeople = useMemo(
    () =>
      countOrganizer ? people : people.filter((person) => !person.isOrganizer),
    [people, countOrganizer],
  );

  const rowSpan = (row: number): string =>
    `${formatSlotLabel(row * slotsPerRow, clockFormat)}–${formatSlotLabel((row + 1) * slotsPerRow, clockFormat)}`;

  const selectedCell: SplitOverlapCell | null =
    selected === null ? null : shownGrid[selected.weekday][selected.row];

  function renderNames(
    userIds: string[],
    organizerStatus?: "AVAILABLE" | "TENTATIVE",
  ) {
    // The organizer is rendered first with their mark; keep them out of the
    // plain list so a counted organizer is not shown twice.
    const rest = userIds.filter((id) => id !== organizerUserId);
    return (
      <ul className="flex flex-col gap-0.5">
        {organizerStatus && organizer && (
          <li>
            <span
              className={`mr-2 inline-block h-3 w-3 align-middle rounded-sm ${ORGANIZER_MARK_CLASSES[organizerStatus]}`}
              aria-hidden="true"
            />
            <span className="break-words">{organizer.displayName}</span>
            <OrganizerBadge className="ml-2 align-middle" />
            <ZoneChip
              label={organizer.timeZone}
              variant="person"
              approximated={organizer.approximated}
              className="ml-1"
            />
          </li>
        )}
        {rest.map((userId) => {
          const person = personById.get(userId);
          if (!person) return null;
          return (
            <li key={userId}>
              <span className="break-words">{person.displayName}</span>
              {person.isOrganizer && <OrganizerBadge className="ml-2 align-middle" />}
              <ZoneChip
                label={person.timeZone}
                variant="person"
                approximated={person.approximated}
                className="ml-1"
              />
            </li>
          );
        })}
        {rest.length === 0 && !organizerStatus && (
          <li className="text-hint">Nobody.</li>
        )}
      </ul>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented
          label="Grid granularity"
          options={[
            { value: "half", label: "Half hour" },
            { value: "hour", label: "Hour" },
          ]}
          value={granularity}
          onChange={(value) => {
            setGranularity(value as Granularity);
            setSelected(null);
          }}
        />

        {organizerUserId !== null && (
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={organizerOnly}
                disabled={!organizerHasAvailability}
                onChange={(e) => {
                  setOrganizerOnly(e.target.checked);
                  setSelected(null);
                }}
              />
              Only times the organizer can make
            </label>
            {!organizerHasAvailability && (
              <span className="text-xs text-hint">
                The organizer has not set their availability for this event
              </span>
            )}
          </div>
        )}
      </div>

      {organizerUserId !== null && (
        <Legend className="mb-3 font-medium text-muted">
          <li className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3.5 w-3.5 rounded-sm ${ORGANIZER_MARK_CLASSES.AVAILABLE}`}
            />
            Organizer available (
            {countOrganizer
              ? "numbers include the organizer"
              : "numbers count participants only"}
            )
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3.5 w-3.5 rounded-sm ${ORGANIZER_MARK_CLASSES.TENTATIVE}`}
            />
            Organizer tentative
          </li>
        </Legend>
      )}

      <div className="grid select-none grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] gap-tile-gap">
        <div />
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center font-small text-xs tracking-wide text-hint uppercase"
          >
            {label}
          </div>
        ))}
        {Array.from({ length: rowCount }, (_, row) => {
          const showLabel = granularity === "hour" || row % 2 === 0;
          return (
            <div key={row} className="contents">
              <div
                className={`flex items-center justify-end whitespace-nowrap pr-2 font-digits text-[10px] text-grid-label ${
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

                // Organizer filter: cells outside their availability go blank.
                if (organizerOnly && cell.organizer === null) {
                  return (
                    <div
                      key={weekday}
                      role="img"
                      aria-label={`${WEEKDAY_NAMES[weekday]} ${rowSpan(row)}, outside organizer availability`}
                      className={`rounded-tile bg-heat-0 font-digits tile-hover ${height}`}
                    />
                  );
                }

                const availableCount = cell.players.available.length;
                const tentativeCount = cell.players.tentative.length;
                const step = heatStep(availableCount, panelPeople.length);
                const heat = `${HEAT_CLASSES[step]} ${HEAT_TEXT_CLASSES[step]}`;
                const organizerMark = cell.organizer
                  ? `${ORGANIZER_MARK_CLASSES[cell.organizer]} tile-mark`
                  : "";
                const organizerLabel =
                  cell.organizer === "AVAILABLE"
                    ? ", organizer available"
                    : cell.organizer === "TENTATIVE"
                      ? ", organizer tentative"
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
                    aria-label={`${WEEKDAY_NAMES[weekday]} ${rowSpan(row)}, ${availableCount} available, ${tentativeCount} tentative${organizerLabel}`}
                    className={`flex cursor-pointer items-center justify-center rounded-tile font-digits text-[10px] leading-none tile-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${heat} ${organizerMark} ${height} ${isSelected ? "outline-2 -outline-offset-2 outline-ring" : ""}`}
                  >
                    {availableCount === 0 && tentativeCount === 0
                      ? submittedCount > 0
                        ? "0"
                        : ""
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
                selectedCell.organizer === "AVAILABLE" ? "AVAILABLE" : undefined,
              )}
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">
                Tentative ({selectedCell.players.tentative.length})
              </p>
              {renderNames(
                selectedCell.players.tentative,
                selectedCell.organizer === "TENTATIVE" ? "TENTATIVE" : undefined,
              )}
            </div>
            <div>
              {(() => {
                // Everyone in the panel's population who is in neither list.
                const painted = new Set([
                  ...selectedCell.players.available,
                  ...selectedCell.players.tentative,
                ]);
                if (selectedCell.organizer !== null && organizerUserId) {
                  painted.add(organizerUserId);
                }
                const notAvailable = panelPeople
                  .filter((person) => !painted.has(person.userId))
                  .map((person) => person.userId);
                return (
                  <>
                    <p className="mb-1 text-xs text-muted">
                      Not available ({notAvailable.length})
                    </p>
                    {renderNames(notAvailable)}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
