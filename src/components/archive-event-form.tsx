"use client";

import { DANGER_SM } from "@/components/button-classes";
import { SaveButton, SaveMessage, useSaveForm, type SaveAction } from "@/components/save-form";

interface Props {
  /** The archiveEvent server action, passed down from the page. */
  action: SaveAction;
  eventId: string;
}

/** Archive control in the Edit event card; always confirmed before it runs. */
export function ArchiveEventForm({ action, eventId }: Props) {
  const { formProps, confirmation, error, errorId } = useSaveForm({
    action,
    confirmKey: "archive",
    confirms: { archive: "Event archived" },
    beforeSubmit: () =>
      confirm(
        "Archive this event? It leaves everyone's lists; you can unarchive it from the Archived section on your home page.",
      ),
  });

  return (
    <form {...formProps}>
      <input type="hidden" name="eventId" value={eventId} />
      <SaveButton className={DANGER_SM} confirmText="Event unarchived" confirmation={confirmation}>
        Archive event
      </SaveButton>
      <SaveMessage error={error} id={errorId} />
    </form>
  );
}
