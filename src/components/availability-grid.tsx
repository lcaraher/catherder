"use client";

import { useRef, useState } from "react";
import {
  cellsToRanges,
  HOURS_PER_DAY,
  type AvailabilityRange,
} from "@/domain/availability";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  initialRanges: AvailabilityRange[];
  initialTimeZone: string;
  timeZones: string[];
}

// Cells are keyed as weekday * 24 + hour so a Set<number> can hold the grid.
function cellKey(weekday: number, hour: number): number {
  return weekday * HOURS_PER_DAY + hour;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function AvailabilityGrid({
  initialRanges,
  initialTimeZone,
  timeZones,
}: Props) {
  const [painted, setPainted] = useState<Set<number>>(() => {
    const cells = new Set<number>();
    for (const range of initialRanges) {
      for (let hour = range.startHour; hour < range.endHour; hour++) {
        cells.add(cellKey(range.weekday, hour));
      }
    }
    return cells;
  });
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [status, setStatus] = useState<SaveStatus>("idle");
  // "paint" or "erase" for the whole drag, decided by the first cell touched.
  const dragMode = useRef<"paint" | "erase" | null>(null);

  // elementFromPoint instead of per-cell pointerenter: touch drags implicitly
  // capture the first element, so enter events never fire on later cells.
  function cellAt(clientX: number, clientY: number): number | null {
    const el = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-cell]");
    return el ? Number(el.dataset.cell) : null;
  }

  function applyCell(cell: number | null) {
    const mode = dragMode.current;
    if (cell === null || mode === null) return;
    setPainted((prev) => {
      if (prev.has(cell) === (mode === "paint")) return prev;
      const next = new Set(prev);
      if (mode === "paint") next.add(cell);
      else next.delete(cell);
      return next;
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const cell = cellAt(e.clientX, e.clientY);
    if (cell === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragMode.current = painted.has(cell) ? "erase" : "paint";
    applyCell(cell);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragMode.current === null) return;
    applyCell(cellAt(e.clientX, e.clientY));
  }

  function endDrag() {
    dragMode.current = null;
  }

  async function save() {
    setStatus("saving");
    try {
      const cells = [...painted].map((cell) => ({
        weekday: Math.floor(cell / HOURS_PER_DAY),
        hour: cell % HOURS_PER_DAY,
      }));
      const response = await fetch("/api/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeZone, ranges: cellsToRanges(cells) }),
      });
      if (!response.ok) throw new Error(`save failed (${response.status})`);
      setStatus("saved");
      setTimeout(
        () => setStatus((s) => (s === "saved" ? "idle" : s)),
        2000,
      );
    } catch {
      setStatus("error");
    }
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
        {Array.from({ length: HOURS_PER_DAY }, (_, hour) => (
          <div key={hour} className="contents">
            <div className="flex items-center justify-end bg-white pr-2 text-[10px] text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
              {String(hour).padStart(2, "0")}:00
            </div>
            {WEEKDAY_LABELS.map((label, weekday) => {
              const cell = cellKey(weekday, hour);
              const isPainted = painted.has(cell);
              return (
                <div
                  key={label}
                  data-cell={cell}
                  aria-label={`${label} ${hour}:00`}
                  className={`h-6 cursor-pointer ${
                    isPainted
                      ? "bg-emerald-500 hover:bg-emerald-400"
                      : "bg-white hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && (
          <span className="text-sm text-emerald-600">Saved ✓</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-600">
            Save failed — please try again.
          </span>
        )}
      </div>
    </div>
  );
}
