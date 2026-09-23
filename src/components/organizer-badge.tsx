/**
 * Chip marking the event's Organizer: a line-drawn crown in the badge
 * tokens. Placeholder artwork for the design pass.
 */
export function OrganizerBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Organizer"
      title="Organizer"
      className={`inline-flex items-center rounded bg-badge-organizer px-1.5 py-0.5 text-badge-organizer-text ${className}`}
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
        <path d="M3 12.5 L2.5 5.5 L5.75 8 L8 4.5 L10.25 8 L13.5 5.5 L13 12.5 Z" />
      </svg>
    </span>
  );
}
