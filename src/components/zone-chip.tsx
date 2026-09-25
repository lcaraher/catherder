import { HalfHourNote } from "@/components/half-hour-note";

const SHAPE =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-edge bg-surface-raised align-middle";

/** A time zone as a rounded chip: the viewer's with a globe, a person's smaller and quiet. */
export function ZoneChip({
  label,
  approximated = false,
  variant = "viewer",
  className = "",
}: {
  label: string;
  approximated?: boolean;
  variant?: "viewer" | "person";
  className?: string;
}) {
  const look =
    variant === "viewer"
      ? "px-2 font-semibold text-foreground"
      : "px-1.5 text-xs font-normal text-hint";
  return (
    <span className={`${SHAPE} ${look} ${className}`}>
      {variant === "viewer" && (
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
      )}
      <span>{label}</span>
      {approximated && (
        <span className="flex shrink-0">
          <HalfHourNote />
        </span>
      )}
    </span>
  );
}
