"use client";

import { useRef, useState } from "react";
import { weekFromRanges, type AvailabilityRange, type SlotStatus } from "@/domain/availability";

/**
 * Grid handling shared by RespondForm and the GM's event-availability
 * editor: tracks the latest on-screen week in a ref, and replaces the whole
 * grid by remounting the editor with a new seed week (bumping `gridKey`) —
 * the editor owns its week state after mount, so that is the only way to
 * swap its contents (e.g. "Reload from my saved availability", "Clear").
 */
export function useWeekGrid(initialRanges: AvailabilityRange[]) {
  const [initialWeek] = useState(() => weekFromRanges(initialRanges));
  const weekRef = useRef<SlotStatus[][]>(initialWeek);
  const [gridKey, setGridKey] = useState(0);
  const [seedWeek, setSeedWeek] = useState(initialWeek);

  function replaceWeek(week: SlotStatus[][]) {
    weekRef.current = week;
    setSeedWeek(week);
    setGridKey((key) => key + 1);
  }

  return {
    initialWeek,
    /** Always the latest painted week; read it at save/submit time. */
    weekRef,
    /**
     * Pass as WeekGridEditor's `key` so bumps remount it. React does not
     * accept `key` via prop spread, so it stays separate from gridProps.
     */
    gridKey,
    /** Spread onto WeekGridEditor: seed week and the onChange mirror. */
    gridProps: {
      initialWeek: seedWeek,
      onChange: (week: SlotStatus[][]) => {
        weekRef.current = week;
      },
    },
    replaceWeek,
  };
}
