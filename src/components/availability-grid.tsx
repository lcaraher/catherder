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
  initialNote: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function AvailabilityGrid({ initialRanges, initialNote }: Props) {
  const [initialWeek] = useState(() => weekFromRanges(initialRanges));
  // The editor owns the on-screen week; we only need the latest value at save.
  const weekRef = useRef<SlotStatus[][]>(initialWeek);
  const [note, setNote] = useState(initialNote);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // The time zone is managed by the TimeZonePicker rendered alongside; this
  // save only touches the week and the note.
  async function save() {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
