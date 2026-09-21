import { heatRanges } from "@/domain/overlap";

// Heat colours by step, 0–5. Static list so Tailwind sees every class.
export const HEAT_CLASSES = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
  "bg-heat-5",
];

/** One swatch per heat step with the available counts that map to it. */
export function HeatLegend({ counted }: { counted: number }) {
  const ranges = heatRanges(counted);
  return (
    <ul aria-label="Cell colours by number available" className="mb-3 flex gap-2">
      {HEAT_CLASSES.map((heat, step) => (
        <li key={heat} className="flex min-w-8 flex-col items-center gap-1">
          <span
            aria-hidden="true"
            className={`h-3.5 w-3.5 rounded-sm border border-edge ${heat}`}
          />
          <span className="text-xs text-hint">{ranges[step]}</span>
        </li>
      ))}
    </ul>
  );
}
