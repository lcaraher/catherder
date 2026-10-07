import Link from "next/link";
import type { EventCardData } from "@/domain/my-events";
import { statusLabel } from "@/domain/status-label";
import { SECONDARY_SM } from "@/components/button-classes";
import { ResultsIcon } from "@/components/results-icon";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-badge-draft text-badge-draft-text",
  OPEN: "bg-badge-open text-badge-open-text",
  CLOSED: "bg-badge-closed text-badge-closed-text",
};

const BUTTON = `${SECONDARY_SM} no-underline inline-flex items-center`;

// One home-page card: the event, its status, the viewer's response state and only the actions they have.
export function EventCard({ card }: { card: EventCardData }) {
  const respondHref = `/e/${card.eventId}/respond`;
  return (
    <li>
      <div className="rounded border border-edge px-4 py-3">
        <span className="block font-medium break-words">{card.name}</span>
        {card.organizerName && (
          <span className="block text-xs break-words text-hint">
            Organized by {card.organizerName}
          </span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[card.status]}`}
          >
            {statusLabel(card.status)}
          </span>
          {card.response === "todo" && (
            <span className="rounded border border-notice-warn-border bg-notice-warn px-2 py-px text-xs font-medium text-notice-warn-text">
              Needs your response
            </span>
          )}
          {card.response === "editable" && (
            <span className="inline-flex items-center gap-1 text-xs text-hint">
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
              Your response can still be changed.
            </span>
          )}
          {card.response === "locked" && (
            <span className="inline-flex items-center gap-1 text-xs text-hint">
              Locked
            </span>
          )}
        </span>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {card.response === "todo" && (
            <Link href={respondHref} className={BUTTON}>
              Respond to Event
            </Link>
          )}
          {card.response === "editable" && (
            <Link href={respondHref} className={BUTTON}>
              Edit Response
            </Link>
          )}
          {card.response === "locked" && (
            <Link href={respondHref} className={BUTTON}>
              View response
            </Link>
          )}
          {card.organizer && (
            <Link href={`/e/${card.eventId}/manage`} className={BUTTON}>
              Manage Event
            </Link>
          )}
          {card.resultsShared && (
            <Link href={`/e/${card.eventId}/responses`} className={`${BUTTON} gap-1.5`}>
              <ResultsIcon />
              See shared results
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
