import {
  formatSlotLabel,
  SLOTS_PER_DAY,
  weekFromRanges,
  type AvailabilityRange,
  type ClockFormat,
  type SlotStatus,
} from "@/domain/availability";
import { Legend } from "@/components/legend";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function stateLabel(status: SlotStatus): string {
  if (status === "AVAILABLE") return "available";
  if (status === "TENTATIVE") return "tentative";
  return "not available";
}

// Same visual language as WeekGridEditor: tentative is distinguished by a
// dashed border as well as color.
function bandClass(status: SlotStatus): string {
  if (status === "AVAILABLE") return "bg-avail";
  if (status === "TENTATIVE") {
    return "bg-tentative border border-dashed border-tentative-border";
  }
  return "bg-unavail";
}

/**
 * Non-interactive weekly grid rendering ranges as the editor shows them.
 * A server component — ships no client JS.
 */
export function WeekGridDisplay({
  ranges,
  clockFormat,
}: {
  ranges: AvailabilityRange[];
  /** The viewer's clock format, passed down from the page — never read here. */
  clockFormat: ClockFormat;
}) {
  const week = weekFromRanges(ranges);

  return (
    <div>
      <Legend className="mb-3 font-medium text-muted">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-avail" />
          Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-dashed border-tentative-border bg-tentative" />
          Tentative
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-edge-strong bg-unavail" />
          Not available
        </li>
      </Legend>

      <div className="grid select-none grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] gap-tile-gap">
        <div />
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center font-small text-xs tracking-wide text-hint uppercase"
          >
            {label}
          </div>
        ))}
        {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
          <div key={slot} className="contents">
            <div className="flex h-4 items-center justify-end whitespace-nowrap pr-2 font-digits text-[10px] text-grid-label">
              {slot % 2 === 0 ? formatSlotLabel(slot, clockFormat) : ""}
            </div>
            {WEEKDAY_LABELS.map((_, weekday) => (
              <div
                key={weekday}
                role="img"
                aria-label={`${WEEKDAY_NAMES[weekday]} ${formatSlotLabel(slot, clockFormat)}–${formatSlotLabel(slot + 1, clockFormat)}, ${stateLabel(week[weekday][slot])}`}
                className={`h-4 rounded-tile tile-hover ${bandClass(week[weekday][slot])}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
