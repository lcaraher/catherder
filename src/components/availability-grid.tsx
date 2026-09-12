"use client";

import { useEffect, useRef, useState } from "react";
import {
  cellsToRanges,
  collapseHourCell,
  cycleStatus,
  SLOTS_PER_DAY,
  slotLabel,
  type AvailabilityRange,
  type AvailabilityStatus,
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

// Slots are keyed as weekday * 48 + slot so a Map<number, status> holds the grid.
function slotKey(weekday: number, slot: number): number {
  return weekday * SLOTS_PER_DAY + slot;
}

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
  const [slots, setSlots] = useState<Map<number, AvailabilityStatus>>(() => {
    const map = new Map<number, AvailabilityStatus>();
    for (const range of initialRanges) {
      for (let slot = range.startSlot; slot < range.endSlot; slot++) {
        map.set(slotKey(range.weekday, slot), range.status);
      }
    }
    return map;
  });
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [note, setNote] = useState(initialNote);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
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
  function keysForCell(weekday: number, row: number): number[] {
    if (granularity === "half") return [slotKey(weekday, row)];
    const base = slotKey(weekday, row * 2);
    return [base, base + 1];
  }

  function applyKeys(keys: number[], status: SlotStatus) {
    setSlots((prev) => {
      if (keys.every((k) => (prev.get(k) ?? null) === status)) return prev;
      const next = new Map(prev);
      for (const key of keys) {
        if (status === null) next.delete(key);
        else next.set(key, status);
      }
      return next;
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const keys = keysForCell(cell.weekday, cell.row);
    // Hour mode collapses the two half-hour slots; a mixed cell counts as
    // empty so the next click makes both halves available.
    const current =
      granularity === "half"
        ? (slots.get(keys[0]) ?? null)
        : collapseHourCell(
            slots.get(keys[0]) ?? null,
            slots.get(keys[1]) ?? null,
          );
    const next = cycleStatus(current === "MIXED" ? null : current);
    stroke.current = { status: next };
    applyKeys(keys, next);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!stroke.current) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    applyKeys(keysForCell(cell.weekday, cell.row), stroke.current.status);
  }

  function endDrag() {
    stroke.current = null;
  }

  async function save() {
    setSaveStatus("saving");
    try {
      const cells = [...slots].map(([key, status]) => ({
        weekday: Math.floor(key / SLOTS_PER_DAY),
        slot: key % SLOTS_PER_DAY,
        status,
      }));
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
    const keys = keysForCell(weekday, row);
    const first = slots.get(keys[0]) ?? null;
    const startSlot = granularity === "half" ? row : row * 2;
    const endSlot = granularity === "half" ? row + 1 : row * 2 + 2;
    const timeSpan = `${slotLabel(startSlot)}–${slotLabel(endSlot)}`;

    if (granularity === "half" || keys.length === 1) {
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

    const second = slots.get(keys[1]) ?? null;
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

      <div
        className="grid select-none grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-px rounded border border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="bg-white dark:bg-zinc-950" />
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="bg-white py-1 text-center text-xs font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"
          >
            {label}
          </div>
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

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
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
