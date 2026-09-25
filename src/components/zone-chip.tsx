import { HalfHourNote } from "@/components/half-hour-note";

/** The viewer's time zone as a rounded chip with a globe. */
export function ZoneChip({
  label,
  approximated = false,
}: {
  label: string;
  approximated?: boolean;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-edge bg-surface-raised px-2 align-middle font-semibold text-foreground">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M1.75 8h12.5M8 1.75c2 2 2 10.5 0 12.5M8 1.75c-2 2-2 10.5 0 12.5" />
      </svg>
      <span>{label}</span>
      {approximated && (
        <span className="flex shrink-0">
          <HalfHourNote />
        </span>
      )}
    </span>
  );
}
