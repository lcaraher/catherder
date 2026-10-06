import { TipButton } from "@/components/tip-button";

const TEXT = "Shown to the nearest half hour";

/**
 * Clock icon marking a zone the grid rounds to the half hour. The sentence is
 * the accessible name and also a tooltip on hover and keyboard focus.
 */
export function HalfHourNote() {
  return (
    <TipButton
      label={TEXT}
      className="inline-flex rounded text-hint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.75 V8 L10.25 9.5" />
      </svg>
    </TipButton>
  );
}
