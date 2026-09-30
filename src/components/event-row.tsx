import Link from "next/link";
import { statusLabel } from "@/domain/status-label";
import { SECONDARY_SM } from "@/components/button-classes";
import { ResultsIcon } from "@/components/results-icon";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-badge-draft text-badge-draft-text",
  OPEN: "bg-badge-open text-badge-open-text",
  CLOSED: "bg-badge-closed text-badge-closed-text",
};

// One inbox row: the event, who organizes it, its status, and the viewer's
// own state — never anything about other people.
export function EventRow({
  href,
  name,
  organizerName,
  status,
  note,
  notePencil = false,
  resultsHref,
}: {
  href: string;
  name: string;
  /** The event's Organizer; events without one show no second line. */
  organizerName?: string;
  status: string;
  note?: string;
  /** Puts a pencil in front of the note. */
  notePencil?: boolean;
  /** Link to shared results; only passed when results are actually shared. */
  resultsHref?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="no-underline block rounded border border-edge px-4 py-3 hover:bg-surface-muted row-edge"
      >
        <span className="block font-medium break-words">{name}</span>
        {organizerName && (
          <span className="block text-xs break-words text-hint">
            Organized by {organizerName}
          </span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
          >
            {statusLabel(status)}
          </span>
          {note && (
            <span className="inline-flex items-center gap-1 text-xs text-hint">
              {notePencil && (
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M10.5 2.5l3 3L6 13H3v-3z" />
                  <path d="M9 4l3 3" />
                </svg>
              )}
              {note}
            </span>
          )}
        </span>
      </Link>
      {resultsHref && (
        <Link
          href={resultsHref}
          className={`${SECONDARY_SM} mt-1 no-underline inline-flex items-center gap-1.5`}
        >
          <ResultsIcon />
          See shared results
        </Link>
      )}
    </li>
  );
}
