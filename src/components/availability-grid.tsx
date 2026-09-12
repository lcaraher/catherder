"use client";

import { useRef, useState } from "react";
import {
  cellsToRanges,
  weekFromRanges,
  weekToCells,
  type AvailabilityRange,
  type SlotStatus,
} from "@/domain/availability";
import { WeekGridEditor } from "@/components/week-grid-editor";

interface Props {
  initialRanges: AvailabilityRange[];
  initialTimeZone: string;
  initialNote: string;
  timeZones: string[];
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function AvailabilityGrid({
  initialRanges,
  initialTimeZone,
  initialNote,
  timeZones,
}: Props) {
  const [initialWeek] = useState(() => weekFromRanges(initialRanges));
  // The editor owns the on-screen week; we only need the latest value at save.
  const weekRef = useRef<SlotStatus[][]>(initialWeek);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [note, setNote] = useState(initialNote);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  async function save() {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timeZone,
          note,
          ranges: cellsToRanges(weekToCells(weekRef.current)),
        }),
      });
      if (!response.ok) throw new Error(`save failed (${response.status})`);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setSaveStatus("error");
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

      <WeekGridEditor
        initialWeek={initialWeek}
        onChange={(week) => {
          weekRef.current = week;
        }}
      />

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
