import {
  SLOTS_PER_DAY,
  slotLabel,
  weekFromRanges,
  type AvailabilityRange,
  type SlotStatus,
} from "@/domain/availability";

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
  if (status === "AVAILABLE") return "bg-emerald-500";
  if (status === "TENTATIVE") {
    return "bg-amber-200 border border-dashed border-amber-700 dark:bg-amber-900/50 dark:border-amber-500";
  }
  return "bg-white dark:bg-zinc-950";
}

/**
 * Non-interactive weekly availability grid: renders ranges exactly as the
 * editor would show them, but with no pointer handlers or edit controls.
 * A server component — displaying a locked response ships no client JS.
 */
export function WeekGridDisplay({ ranges }: { ranges: AvailabilityRange[] }) {
  const week = weekFromRanges(ranges);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-emerald-500" />
          Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-dashed border-amber-700 bg-amber-200 dark:border-amber-500 dark:bg-amber-900/50" />
          Tentative
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950" />
          Not available
        </li>
      </ul>

      <div className="grid select-none grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-px rounded border border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800">
        <div className="bg-white dark:bg-zinc-950" />
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="bg-white py-1 text-center text-xs font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"
          >
            {label}
          </div>
        ))}
        {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
          <div key={slot} className="contents">
            <div className="flex h-4 items-center justify-end bg-white pr-2 text-[10px] text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
              {slot % 2 === 0 ? slotLabel(slot) : ""}
            </div>
            {WEEKDAY_LABELS.map((_, weekday) => (
              <div
                key={weekday}
                aria-label={`${WEEKDAY_NAMES[weekday]} ${slotLabel(slot)}–${slotLabel(slot + 1)}, ${stateLabel(week[weekday][slot])}`}
                className={`h-4 ${bandClass(week[weekday][slot])}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
