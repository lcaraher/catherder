import { heatRanges } from "@/domain/overlap";
import { Legend } from "@/components/legend";

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

/** One swatch per heat step with the available counts that map to it. */
export function HeatLegend({ counted }: { counted: number }) {
  const ranges = heatRanges(counted);
  return (
    <Legend label="Cell colours by number available" className="mb-3 gap-x-2">
      {HEAT_CLASSES.map((heat, step) => (
        <li key={heat} className="flex min-w-8 flex-col items-center gap-1">
          <span
            aria-hidden="true"
            className={`h-3.5 w-3.5 rounded ${heat} ${step === 0 ? "border border-edge-strong" : ""}`}
          />
          <span className="text-xs font-medium text-hint">{ranges[step]}</span>
        </li>
      ))}
    </Legend>
  );
}
