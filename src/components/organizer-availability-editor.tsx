"use client";

import { useRef, useState } from "react";
import { DANGER, DANGER_SM, PRIMARY, SECONDARY_SM } from "@/components/button-classes";
import {
  cellsToRanges,
  emptyWeek,
  weekFromRanges,
  weeksEqual,
  weekToCells,
  type AvailabilityRange,
  type ClockFormat,
  type SlotStatus,
} from "@/domain/availability";
import { SaveButton, UnsavedNote } from "@/components/save-form";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { WeekGridEditor } from "@/components/week-grid-editor";
import { useWeekGrid } from "@/components/use-week-grid";

interface Props {
  eventId: string;
  /** The organizer's current EventAvailability rows, as ranges. */
  initialRanges: AvailabilityRange[];
  /** The organizer's standing week, for "Reload from my saved availability". */
  standingRanges: AvailabilityRange[];
  /** The viewer's clock format, passed down from the page — never read here. */
  clockFormat: ClockFormat;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Week editor for the organizer's own event availability: Save writes only
 * their EventAvailability rows; Clear removes them.
 */
export function OrganizerAvailabilityEditor({
  eventId,
  initialRanges,
  standingRanges,
  clockFormat,
}: Props) {
  const { initialWeek, weekRef, week, gridKey, gridProps, replaceWeek } =
    useWeekGrid(initialRanges);
  // The last successful save; Save stays dimmed until the painted cells differ from it.
  const [savedWeek, setSavedWeek] = useState(initialWeek);
  const dirty = !weeksEqual(week, savedWeek);
  useUnsavedChangesGuard(() => !weeksEqual(weekRef.current, savedWeek));
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Which button started the last save; its own button shows the result.
  const [savedBy, setSavedBy] = useState<"save" | "clear">("save");
  const savedTimer = useRef<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmingReload, setConfirmingReload] = useState(false);

  // Browser-side only, like the respond form's button: the grid now shows
  // the standing week, but nothing is stored until Save is clicked.
  function reloadFromStanding() {
    replaceWeek(weekFromRanges(standingRanges));
    setConfirmingReload(false);
  }

  async function put(sentWeek: SlotStatus[][], by: "save" | "clear") {
    setSavedBy(by);
    setStatus("saving");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/organizer-availability`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ranges: cellsToRanges(weekToCells(sentWeek)) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `save failed (${response.status})`);
      }
      setSavedWeek(sentWeek);
      setStatus("saved");
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(
        () => setStatus((s) => (s === "saved" ? "idle" : s)),
        2000,
      );
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
    void put(empty, "clear");
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
                  className={DANGER_SM}
                >
                  Yes, replace
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReload(false)}
                  className={SECONDARY_SM}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingReload(true)}
                className={SECONDARY_SM}
              >
                Reload from my saved availability
              </button>
            )}
          </div>
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {dirty && <UnsavedNote size="md" onDiscard={() => replaceWeek(savedWeek)} />}
        <SaveButton
          type="button"
          onClick={() => put(weekRef.current, "save")}
          disabled={status === "saving"}
          inactive={!dirty}
          className={`${PRIMARY} text-sm`}
          confirmText="Saved"
          confirmation={status === "saved" && savedBy === "save" ? "Saved" : null}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </SaveButton>
        <SaveButton
          type="button"
          onClick={clear}
          disabled={status === "saving"}
          className={DANGER}
          confirmText="Cleared"
          confirmation={status === "saved" && savedBy === "clear" ? "Cleared" : null}
        >
          Clear
        </SaveButton>
        <p role="status" className="sr-only">
          {status === "saved" ? (savedBy === "clear" ? "Cleared" : "Saved") : ""}
        </p>
        {status === "error" && (
          <span className="text-sm text-error">{errorMessage}</span>
        )}
      </div>
    </div>
  );
}
