"use client";

import { DANGER_SM } from "@/components/button-classes";

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
        className={DANGER_SM}
      >
        Archive event
      </button>
    </form>
  );
}
