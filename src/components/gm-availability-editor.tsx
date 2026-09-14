"use client";

import { useState } from "react";
import {
  cellsToRanges,
  emptyWeek,
  weekFromRanges,
  weekToCells,
  type AvailabilityRange,
  type ClockFormat,
  type SlotStatus,
} from "@/domain/availability";
import { WeekGridEditor } from "@/components/week-grid-editor";
import { useWeekGrid } from "@/components/use-week-grid";

interface Props {
  eventId: string;
  /** The GM's current EventAvailability rows, as ranges. */
  initialRanges: AvailabilityRange[];
  /** The GM's standing week, for "Reload from my saved availability". */
  standingRanges: AvailabilityRange[];
  /** The viewer's clock format, passed down from the page — never read here. */
  clockFormat: ClockFormat;
}

const smallButton =
  "rounded border border-edge-strong px-3 py-1 hover:bg-btn-secondary-hover disabled:opacity-50";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * The GM's week editor for one event: the same grid handling as the respond
 * form, but saving writes only the GM's EventAvailability rows — no answers,
 * no response status, no submit language. Clear removes the stored rows so
 * the overlap shows the players on their own.
 */
export function GmAvailabilityEditor({
  eventId,
  initialRanges,
  standingRanges,
  clockFormat,
}: Props) {
  const { weekRef, gridKey, gridProps, replaceWeek } =
    useWeekGrid(initialRanges);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmingReload, setConfirmingReload] = useState(false);

  // Browser-side only, like the respond form's button: the grid now shows
  // the standing week, but nothing is stored until Save is clicked.
  function reloadFromStanding() {
    replaceWeek(weekFromRanges(standingRanges));
    setConfirmingReload(false);
  }

  async function put(week: SlotStatus[][]) {
    setStatus("saving");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/gm-availability`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ranges: cellsToRanges(weekToCells(week)) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `save failed (${response.status})`);
      }
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Save failed.",
      );
      setStatus("error");
    }
  }

  function clear() {
    const empty = emptyWeek();
    replaceWeek(empty);
    void put(empty);
  }

  return (
    <div>
      <WeekGridEditor
        key={gridKey}
        {...gridProps}
        clockFormat={clockFormat}
        extraControls={
          <div className="flex flex-wrap items-center gap-2">
            {confirmingReload ? (
              <>
                <span className="text-muted">
                  Replace this grid with your saved week? Edits made here for
                  this event will be lost.
                </span>
                <button
                  type="button"
                  onClick={reloadFromStanding}
                  className="rounded border border-btn-danger-border px-3 py-1 text-btn-danger-text hover:bg-btn-danger-wash"
                >
                  Yes, replace
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReload(false)}
                  className={smallButton}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingReload(true)}
                className={`${smallButton} text-muted`}
              >
                Reload from my saved availability
              </button>
            )}
          </div>
        }
      />
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => put(weekRef.current)}
          disabled={status === "saving"}
          className="rounded bg-btn-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-primary-hover disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={status === "saving"}
          className="rounded border border-btn-danger-border px-3 py-1.5 text-sm text-btn-danger-text hover:bg-btn-danger-wash disabled:opacity-50"
        >
          Clear
        </button>
        {status === "saved" && (
          <span className="text-sm text-status-submitted">Saved ✓</span>
        )}
        {status === "error" && (
          <span className="text-sm text-error">{errorMessage}</span>
        )}
      </div>
    </div>
  );
}
