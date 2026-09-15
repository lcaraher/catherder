"use client";

import { useRef, useState } from "react";
import {
  cellsToRanges,
  weekFromRanges,
  weeksEqual,
  weekToCells,
  type AvailabilityRange,
  type ClockFormat,
  type SlotStatus,
} from "@/domain/availability";
import { WeekGridEditor } from "@/components/week-grid-editor";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";

interface Props {
  initialRanges: AvailabilityRange[];
  initialNote: string;
  /** The viewer's clock format, passed down from the page — never read here. */
  clockFormat: ClockFormat;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function AvailabilityGrid({
  initialRanges,
  initialNote,
  clockFormat,
}: Props) {
  const [initialWeek] = useState(() => weekFromRanges(initialRanges));
  // The editor owns the on-screen week; we only need the latest value at save.
  const weekRef = useRef<SlotStatus[][]>(initialWeek);
  const [note, setNote] = useState(initialNote);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // The last successful save; dirtiness compares against it, so painting a
  // cell and painting it back leaves the form clean.
  const savedRef = useRef({ week: initialWeek, note: initialNote });
  useUnsavedChangesGuard(
    () =>
      !weeksEqual(weekRef.current, savedRef.current.week) ||
      note !== savedRef.current.note,
  );

  // The time zone is managed by the TimeZonePicker rendered alongside; this
  // save only touches the week and the note.
  async function save() {
    const sentWeek = weekRef.current;
    const sentNote = note;
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          note: sentNote,
          ranges: cellsToRanges(weekToCells(sentWeek)),
        }),
      });
      if (!response.ok) throw new Error(`save failed (${response.status})`);
      savedRef.current = { week: sentWeek, note: sentNote };
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setSaveStatus("error");
    }
  }

  // Rendered above the grid and below the note; both buttons share one status.
  function saveControls(margin: string) {
    return (
      <div className={`${margin} flex items-center gap-3`}>
        <button
          type="button"
          onClick={save}
          disabled={saveStatus === "saving"}
          className="rounded bg-btn-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-primary-hover disabled:opacity-50"
        >
          {saveStatus === "saving" ? "Saving…" : "Save"}
        </button>
        {saveStatus === "saved" && (
          <span className="text-sm text-status-submitted">Saved ✓</span>
        )}
        {saveStatus === "error" && (
          <span className="text-sm text-error">
            Save failed — please try again.
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      {saveControls("mb-4")}

      <WeekGridEditor
        initialWeek={initialWeek}
        onChange={(week) => {
          weekRef.current = week;
        }}
        clockFormat={clockFormat}
      />

      <div className="mt-5">
        <label
          htmlFor="availability-note"
          className="mb-1 block text-sm text-muted"
        >
          Anything I should know about your availability?
        </label>
        <textarea
          id="availability-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full rounded border border-edge-strong bg-field px-3 py-2 text-sm"
        />
      </div>

      {saveControls("mt-4")}
    </div>
  );
}
