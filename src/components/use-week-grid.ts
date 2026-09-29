"use client";

import { useRef, useState } from "react";
import { weekFromRanges, type AvailabilityRange, type SlotStatus } from "@/domain/availability";

/**
 * Tracks the latest on-screen week in a ref and replaces the whole grid by
 * remounting the editor with a new seed week (bumping `gridKey`).
 */
export function useWeekGrid(initialRanges: AvailabilityRange[]) {
  const [initialWeek] = useState(() => weekFromRanges(initialRanges));
  const weekRef = useRef<SlotStatus[][]>(initialWeek);
  const [gridKey, setGridKey] = useState(0);
  const [seedWeek, setSeedWeek] = useState(initialWeek);
  const [week, setWeek] = useState(initialWeek);

  function replaceWeek(next: SlotStatus[][]) {
    weekRef.current = next;
    setSeedWeek(next);
    setWeek(next);
    setGridKey((key) => key + 1);
  }

  return {
    initialWeek,
    /** Always the latest painted week; read it at save/submit time. */
    weekRef,
    /** The latest painted week as state, for comparing with the saved one. */
    week,
    /** Pass as WeekGridEditor's `key`; React rejects `key` in a prop spread. */
    gridKey,
    /** Spread onto WeekGridEditor: seed week and the onChange mirror. */
    gridProps: {
      initialWeek: seedWeek,
      onChange: (next: SlotStatus[][]) => {
        weekRef.current = next;
        setWeek(next);
      },
    },
    replaceWeek,
  };
}
