"use client";

interface Props {
  /** The archiveEvent server action, passed down from the page. */
  action: (formData: FormData) => void | Promise<void>;
  eventId: string;
}

/** Archive control in the Edit event card; always confirmed before it runs. */
export function ArchiveEventForm({ action, eventId }: Props) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !confirm(
            "Archive this event? It leaves everyone's lists; you can unarchive it from the Archived section on your home page.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <button
        type="submit"
        className="rounded border border-btn-danger-border px-2 py-1 text-xs text-btn-danger-text hover:bg-btn-danger-wash"
      >
        Archive event
      </button>
    </form>
  );
}
