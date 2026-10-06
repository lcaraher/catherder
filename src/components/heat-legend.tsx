"use client";

import { useId, useSyncExternalStore } from "react";
import { heatRanges, heatStep } from "@/domain/overlap";
import { SECONDARY_SM } from "@/components/button-classes";
import { EyeIcon } from "@/components/eye-icon";
import { TipButton } from "@/components/tip-button";

// Heat colours by step, 0–5. Static list so Tailwind sees every class.
export const HEAT_CLASSES = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
  "bg-heat-5",
];

// Digit colour by step; each step has its own so the count reads on every fill.
export const HEAT_TEXT_CLASSES = [
  "text-heat-text-0",
  "text-heat-text-1",
  "text-heat-text-2",
  "text-heat-text-3",
  "text-heat-text-4",
  "text-heat-text-5",
];

// Organizer mark: solid border for available, dashed for tentative. Static
// strings so Tailwind sees every class.
export const ORGANIZER_MARK_CLASSES = {
  AVAILABLE: "border-2 border-solid border-organizer-mark",
  TENTATIVE: "border-2 border-dashed border-organizer-mark",
} as const;

const HIDDEN_KEY = "catherder-legend-hidden";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// True unless this browser hid the legend; a storage error reads as shown.
function readShown() {
  try {
    return localStorage.getItem(HIDDEN_KEY) !== "1";
  } catch {
    return true;
  }
}

function storeShown(shown: boolean) {
  try {
    if (shown) localStorage.removeItem(HIDDEN_KEY);
    else localStorage.setItem(HIDDEN_KEY, "1");
  } catch {}
  listeners.forEach((listener) => listener());
}

/** The overlap grid's legend: heat swatches, a sample tile and the organizer marks, hideable. */
export function HeatLegend({
  counted,
  countOrganizer,
}: {
  counted: number;
  countOrganizer: boolean;
}) {
  const shown = useSyncExternalStore(subscribe, readShown, () => true);
  const boxId = useId();
  const ranges = heatRanges(counted);
  const sampleStep = heatStep(2, counted);

  return (
    <>
      <div className={`flex items-center ${shown ? "mb-1.5" : "mb-3"}`}>
        <p className="font-small text-xs font-medium text-muted">Legend</p>
        <div className="ml-2 flex">
          <TipButton
            label={shown ? "Hide legend" : "Show legend"}
            aria-expanded={shown}
            aria-controls={boxId}
            onClick={() => storeShown(!shown)}
            className={`${SECONDARY_SM} inline-flex items-center`}
          >
            <EyeIcon open={shown} className="h-4 w-4" />
          </TipButton>
        </div>
      </div>
      {shown && (
        <div
          id={boxId}
          className="mb-3 inline-flex flex-col gap-2 rounded border border-edge bg-surface-raised px-3 py-2 text-xs"
        >
          <ul aria-label="Cell colors by number available" className="flex flex-wrap items-end gap-2">
            {HEAT_CLASSES.map((heat, step) =>
              step === 0 || ranges[step] !== "—" ? (
                <li key={heat} className="flex min-w-8 flex-col items-center gap-1">
                  <span
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 rounded ${heat} ${step === 0 ? "border border-edge-strong" : ""}`}
                  />
                  <span className="min-h-4 font-medium text-hint">{step === 0 ? "0" : ranges[step]}</span>
                </li>
              ) : null,
            )}
            <li className="ml-3 flex flex-col items-center gap-1">
              <span
                className={`grid h-3.5 place-content-center rounded px-1.5 font-digits text-[10px] leading-none ${HEAT_CLASSES[sampleStep]} ${HEAT_TEXT_CLASSES[sampleStep]}`}
              >
                2 · 1
              </span>
              <span className="font-medium text-hint">available · tentative</span>
            </li>
          </ul>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-edge pt-2 font-medium text-muted">
            <li className="flex items-center gap-1.5">
              <span
                className={`inline-block h-3.5 w-3.5 rounded-sm ${ORGANIZER_MARK_CLASSES.AVAILABLE}`}
              />
              Organizer available (
              {countOrganizer
                ? "numbers include the organizer"
                : "numbers count participants only"}
              )
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className={`inline-block h-3.5 w-3.5 rounded-sm ${ORGANIZER_MARK_CLASSES.TENTATIVE}`}
              />
              Organizer tentative
            </li>
          </ul>
        </div>
      )}
    </>
  );
}
