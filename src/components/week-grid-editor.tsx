"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearWeek,
  collapseDay,
  collapseHourCell,
  copyDaySlots,
  cycleStatus,
  formatSlotLabel,
  setDaySlots,
  SLOTS_PER_DAY,
  WEEKDAY_COUNT,
  type ClockFormat,
  type SlotStatus,
} from "@/domain/availability";

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

interface Props {
  initialWeek: SlotStatus[][];
  /** Called with the full week after every on-screen edit. */
  onChange: (week: SlotStatus[][]) => void;
  /** The viewer's clock format, passed down from the page — never read here. */
  clockFormat: ClockFormat;
  /**
   * Extra parent-owned controls rendered in the bulk-edit row, to the right
   * of "Clear week" (e.g. the respond form's reload-from-saved button).
   */
  extraControls?: React.ReactNode;
}

type Granularity = "half" | "hour";

function stateLabel(status: SlotStatus): string {
  if (status === "AVAILABLE") return "available";
  if (status === "TENTATIVE") return "tentative";
  return "not available";
}

// Tentative is distinguished by a dashed border as well as color.
function bandClass(status: SlotStatus): string {
  if (status === "AVAILABLE") return "bg-avail";
  if (status === "TENTATIVE") {
    return "bg-tentative border border-dashed border-tentative-border";
  }
  return "bg-unavail";
}

/**
 * The paintable 7-day availability grid with its granularity toggle,
 * instructions, legend, and bulk-edit (copy day / clear week) controls.
 * Owns the week state; parents receive every change through onChange.
 */
export function WeekGridEditor({
  initialWeek,
  onChange,
  clockFormat,
  extraControls,
}: Props) {
  const [week, setWeek] = useState<SlotStatus[][]>(initialWeek);
  const [copySource, setCopySource] = useState(0);
  const [copyTargets, setCopyTargets] = useState<boolean[]>(() =>
    Array(WEEKDAY_COUNT).fill(false),
  );
  const [confirmingClear, setConfirmingClear] = useState(false);
  // Server and client both render half-hour mode (no hydration mismatch);
  // after mount, narrow viewports fall back to hour mode unless the user
  // has already chosen a granularity themselves.
  const [granularity, setGranularity] = useState<Granularity>("half");
  const toggleTouched = useRef(false);
  useEffect(() => {
    if (
      !toggleTouched.current &&
      window.matchMedia("(max-width: 640px)").matches
    ) {
      setGranularity("hour");
    }
  }, []);

  // Latest-ref pattern so the change-mirror effect never re-fires just
  // because the parent re-rendered with a new callback identity.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current(week);
  }, [week]);

  // The state the whole drag applies, decided by the first cell's cycle step.
  const stroke = useRef<{ status: SlotStatus } | null>(null);

  // elementFromPoint instead of per-cell pointerenter: touch drags implicitly
  // capture the first element, so enter events never fire on later cells.
  function cellAt(
    clientX: number,
    clientY: number,
  ): { weekday: number; row: number } | null {
    const el = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-w]");
    if (!el) return null;
    return { weekday: Number(el.dataset.w), row: Number(el.dataset.r) };
  }

  // A grid cell covers one slot in half-hour mode, two in hour mode.
  function slotsForRow(row: number): number[] {
    return granularity === "half" ? [row] : [row * 2, row * 2 + 1];
  }

  function applySlots(weekday: number, slotIdxs: number[], status: SlotStatus) {
    setWeek((prev) => {
      if (slotIdxs.every((slot) => prev[weekday][slot] === status)) return prev;
      const next = prev.map((day, w) => (w === weekday ? [...day] : day));
      for (const slot of slotIdxs) next[weekday][slot] = status;
      return next;
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const slotIdxs = slotsForRow(cell.row);
    // Hour mode collapses the two half-hour slots; a mixed cell counts as
    // empty so the next click makes both halves available.
    const current =
      granularity === "half"
        ? week[cell.weekday][slotIdxs[0]]
        : collapseHourCell(
            week[cell.weekday][slotIdxs[0]],
            week[cell.weekday][slotIdxs[1]],
          );
    const next = cycleStatus(current === "MIXED" ? null : current);
    stroke.current = { status: next };
    applySlots(cell.weekday, slotIdxs, next);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!stroke.current) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    applySlots(cell.weekday, slotsForRow(cell.row), stroke.current.status);
  }

  function endDrag() {
    stroke.current = null;
  }

  // Column toggle: a mixed day counts as empty (same rule as collapseHourCell),
  // so the next click always makes the whole day available.
  function nextDayStatus(weekday: number): SlotStatus {
    const collapsed = collapseDay(week[weekday]);
    return cycleStatus(collapsed === "MIXED" ? null : collapsed);
  }

  function toggleDay(weekday: number) {
    setWeek((prev) => {
      const collapsed = collapseDay(prev[weekday]);
      const next = cycleStatus(collapsed === "MIXED" ? null : collapsed);
      return setDaySlots(prev, weekday, next);
    });
  }

  function applyCopy() {
    const targets = copyTargets.flatMap((on, day) => (on ? [day] : []));
    if (targets.length === 0) return;
    setWeek((prev) => copyDaySlots(prev, copySource, targets));
    setCopyTargets(Array(WEEKDAY_COUNT).fill(false));
  }

  // On-screen only, like every other edit; parents decide when to persist.
  const weekIsEmpty = week.every((day) => day.every((slot) => slot === null));

  function confirmClear() {
    setWeek((prev) => clearWeek(prev));
    setConfirmingClear(false);
  }

  const rowCount = granularity === "half" ? SLOTS_PER_DAY : 24;

  function renderCell(weekday: number, row: number) {
    const slotIdxs = slotsForRow(row);
    const first = week[weekday][slotIdxs[0]];
    const startSlot = slotIdxs[0];
    const endSlot = slotIdxs[slotIdxs.length - 1] + 1;
    const timeSpan = `${formatSlotLabel(startSlot, clockFormat)}–${formatSlotLabel(endSlot, clockFormat)}`;

    if (slotIdxs.length === 1) {
      return (
        <div
          key={weekday}
          data-w={weekday}
          data-r={row}
          aria-label={`${WEEKDAY_NAMES[weekday]} ${timeSpan}, ${stateLabel(first)}`}
          className={`h-4 cursor-pointer ${bandClass(first)}`}
        />
      );
    }

    const second = week[weekday][slotIdxs[1]];
    const collapsed = collapseHourCell(first, second);
    if (collapsed !== "MIXED") {
      return (
        <div
          key={weekday}
          data-w={weekday}
          data-r={row}
          aria-label={`${WEEKDAY_NAMES[weekday]} ${timeSpan}, ${stateLabel(collapsed)}`}
          className={`h-6 cursor-pointer ${bandClass(collapsed)}`}
        />
      );
    }
    // Mixed hour cell: top band is the first half hour, bottom the second.
    return (
      <div
        key={weekday}
        data-w={weekday}
        data-r={row}
        aria-label={`${WEEKDAY_NAMES[weekday]} ${timeSpan}, first half ${stateLabel(first)}, second half ${stateLabel(second)}`}
        className="flex h-6 cursor-pointer flex-col"
      >
        <div className={`h-1/2 ${bandClass(first)}`} />
        <div className={`h-1/2 ${bandClass(second)}`} />
      </div>
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
              toggleTouched.current = true;
              setGranularity(value);
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

      <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-muted">
        <li>
          Click a cell to cycle it between available, tentative, and not
          available.
        </li>
        <li>Drag to paint several cells at once.</li>
        <li>Click a day name to set that whole day.</li>
        <li>
          Half-hour detail can only be created in Half hour mode — Hour mode
          shows a split cell as two bands, but clicking it sets the whole hour.
        </li>
      </ul>

      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-avail" />
          Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-dashed border-tentative-border bg-tentative" />
          Tentative
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-edge-strong bg-unavail" />
          Not available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-flex h-3.5 w-3.5 flex-col overflow-hidden rounded-sm border border-edge-strong">
            <span className="h-1/2 bg-avail" />
            <span className="h-1/2 border-t border-dashed border-split-band bg-tentative" />
          </span>
          Hour view split cell: top = first half hour, bottom = second half hour
        </li>
      </ul>

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <label htmlFor="copy-source" className="text-muted">
          Copy
        </label>
        <select
          id="copy-source"
          value={copySource}
          onChange={(e) => {
            const source = Number(e.target.value);
            setCopySource(source);
            setCopyTargets((prev) =>
              prev.map((on, day) => (day === source ? false : on)),
            );
          }}
          className="rounded border border-edge-strong bg-field px-2 py-1"
        >
          {WEEKDAY_NAMES.map((name, day) => (
            <option key={name} value={day}>
              {name}
            </option>
          ))}
        </select>
        <span className="text-muted">to</span>
        {WEEKDAY_LABELS.map((label, day) => (
          <label
            key={label}
            className={`flex items-center gap-1 ${
              day === copySource
                ? "text-disabled"
                : "text-muted"
            }`}
          >
            <input
              type="checkbox"
              checked={copyTargets[day]}
              disabled={day === copySource}
              onChange={(e) =>
                setCopyTargets((prev) =>
                  prev.map((on, d) => (d === day ? e.target.checked : on)),
                )
              }
            />
            {label}
          </label>
        ))}
        <button
          type="button"
          onClick={applyCopy}
          disabled={!copyTargets.some(Boolean)}
          className="rounded border border-edge-strong px-3 py-1 hover:bg-btn-secondary-hover disabled:opacity-50"
        >
          Apply
        </button>

        <div className="ml-4 flex items-center gap-2">
          {confirmingClear ? (
            <>
              <span className="text-muted">
                Clear everything?
              </span>
              <button
                type="button"
                onClick={confirmClear}
                className="rounded border border-btn-danger-border px-3 py-1 text-btn-danger-text hover:bg-btn-danger-wash"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="rounded border border-edge-strong px-3 py-1 hover:bg-btn-secondary-hover"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              disabled={weekIsEmpty}
              className="rounded border border-edge-strong px-3 py-1 text-muted hover:bg-btn-secondary-hover disabled:opacity-50"
            >
              Clear week
            </button>
          )}
        </div>
        {extraControls}
      </div>

      <div
        className="grid select-none grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-px rounded border border-grid-line bg-grid-line"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="bg-surface-card" />
        {WEEKDAY_LABELS.map((label, weekday) => (
          <button
            key={label}
            type="button"
            onClick={() => toggleDay(weekday)}
            aria-label={`${WEEKDAY_NAMES[weekday]}: set the whole day to ${stateLabel(nextDayStatus(weekday))}`}
            className="bg-surface-card py-1 text-center text-xs font-medium text-muted hover:bg-btn-secondary-hover"
          >
            {label}
          </button>
        ))}
        {Array.from({ length: rowCount }, (_, row) => {
          const startSlot = granularity === "half" ? row : row * 2;
          const showLabel = granularity === "hour" || row % 2 === 0;
          return (
            <div key={row} className="contents">
              <div
                className={`flex items-center justify-end bg-surface-card pr-2 text-[10px] text-grid-label ${
                  granularity === "half" ? "h-4" : "h-6"
                }`}
              >
                {showLabel ? formatSlotLabel(startSlot, clockFormat) : ""}
              </div>
              {WEEKDAY_LABELS.map((_, weekday) => renderCell(weekday, row))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
