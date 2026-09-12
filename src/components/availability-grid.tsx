"use client";

import { useEffect, useRef, useState } from "react";
import {
  cellsToRanges,
  collapseDay,
  collapseHourCell,
  copyDaySlots,
  cycleStatus,
  emptyWeek,
  setDaySlots,
  SLOTS_PER_DAY,
  slotLabel,
  WEEKDAY_COUNT,
  type AvailabilityCell,
  type AvailabilityRange,
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
  initialRanges: AvailabilityRange[];
  initialTimeZone: string;
  initialNote: string;
  timeZones: string[];
}

type Granularity = "half" | "hour";
type SaveStatus = "idle" | "saving" | "saved" | "error";

function stateLabel(status: SlotStatus): string {
  if (status === "AVAILABLE") return "available";
  if (status === "TENTATIVE") return "tentative";
  return "not available";
}

// Tentative is distinguished by a dashed border as well as color.
function bandClass(status: SlotStatus): string {
  if (status === "AVAILABLE") return "bg-emerald-500";
  if (status === "TENTATIVE") {
    return "bg-amber-200 border border-dashed border-amber-700 dark:bg-amber-900/50 dark:border-amber-500";
  }
  return "bg-white dark:bg-zinc-950";
}

export function AvailabilityGrid({
  initialRanges,
  initialTimeZone,
  initialNote,
  timeZones,
}: Props) {
  // week[weekday][slot], 7 × 48 — the shape the domain helpers operate on.
  const [week, setWeek] = useState<SlotStatus[][]>(() => {
    const w = emptyWeek();
    for (const range of initialRanges) {
      for (let slot = range.startSlot; slot < range.endSlot; slot++) {
        w[range.weekday][slot] = range.status;
      }
    }
    return w;
  });
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [note, setNote] = useState(initialNote);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [copySource, setCopySource] = useState(0);
  const [copyTargets, setCopyTargets] = useState<boolean[]>(() =>
    Array(WEEKDAY_COUNT).fill(false),
  );
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

  async function save() {
    setSaveStatus("saving");
    try {
      const cells: AvailabilityCell[] = [];
      week.forEach((day, weekday) =>
        day.forEach((status, slot) => {
          if (status !== null) cells.push({ weekday, slot, status });
        }),
      );
      const response = await fetch("/api/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeZone, note, ranges: cellsToRanges(cells) }),
      });
      if (!response.ok) throw new Error(`save failed (${response.status})`);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setSaveStatus("error");
    }
  }

  const rowCount = granularity === "half" ? SLOTS_PER_DAY : 24;

  function renderCell(weekday: number, row: number) {
    const slotIdxs = slotsForRow(row);
    const first = week[weekday][slotIdxs[0]];
    const startSlot = slotIdxs[0];
    const endSlot = slotIdxs[slotIdxs.length - 1] + 1;
    const timeSpan = `${slotLabel(startSlot)}–${slotLabel(endSlot)}`;

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
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="timezone" className="text-zinc-600 dark:text-zinc-400">
          Time zone
        </label>
        <select
          id="timezone"
          value={timeZone}
          onChange={(e) => setTimeZone(e.target.value)}
          className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <span className="text-zinc-500">
          Hours below are wall-clock times in this zone.
        </span>
      </div>

      <div
        className="mb-3 inline-flex overflow-hidden rounded border border-zinc-300 text-sm dark:border-zinc-700"
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
                ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
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

      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-emerald-500" />
          Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-dashed border-amber-700 bg-amber-200 dark:border-amber-500 dark:bg-amber-900/50" />
          Tentative
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950" />
          Not available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-flex h-3.5 w-3.5 flex-col overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-700">
            <span className="h-1/2 bg-emerald-500" />
            <span className="h-1/2 border-t border-dashed border-amber-700 bg-amber-200 dark:border-amber-500 dark:bg-amber-900/50" />
          </span>
          Hour view split cell: top = first half hour, bottom = second half hour
        </li>
      </ul>

      <div
        className="grid select-none grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-px rounded border border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="bg-white dark:bg-zinc-950" />
        {WEEKDAY_LABELS.map((label, weekday) => (
          <button
            key={label}
            type="button"
            onClick={() => toggleDay(weekday)}
            aria-label={`${WEEKDAY_NAMES[weekday]}: set the whole day to ${stateLabel(nextDayStatus(weekday))}`}
            className="bg-white py-1 text-center text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900"
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
                className={`flex items-center justify-end bg-white pr-2 text-[10px] text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500 ${
                  granularity === "half" ? "h-4" : "h-6"
                }`}
              >
                {showLabel ? slotLabel(startSlot) : ""}
              </div>
              {WEEKDAY_LABELS.map((_, weekday) => renderCell(weekday, row))}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <label htmlFor="copy-source" className="text-zinc-600 dark:text-zinc-400">
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
          className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {WEEKDAY_NAMES.map((name, day) => (
            <option key={name} value={day}>
              {name}
            </option>
          ))}
        </select>
        <span className="text-zinc-600 dark:text-zinc-400">to</span>
        {WEEKDAY_LABELS.map((label, day) => (
          <label
            key={label}
            className={`flex items-center gap-1 ${
              day === copySource
                ? "text-zinc-300 dark:text-zinc-700"
                : "text-zinc-600 dark:text-zinc-400"
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
          className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Apply
        </button>
      </div>

      <div className="mt-5">
        <label
          htmlFor="availability-note"
          className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400"
        >
          Anything I should know about your availability?
        </label>
        <textarea
          id="availability-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saveStatus === "saving"}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saveStatus === "saving" ? "Saving…" : "Save"}
        </button>
        {saveStatus === "saved" && (
          <span className="text-sm text-emerald-600">Saved ✓</span>
        )}
        {saveStatus === "error" && (
          <span className="text-sm text-red-600">
            Save failed — please try again.
          </span>
        )}
      </div>
    </div>
  );
}
