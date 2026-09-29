"use client";

import { useState } from "react";
import { SECONDARY_SM } from "@/components/button-classes";
import { SaveButton, SaveMessage, useSaveForm, type SaveAction } from "@/components/save-form";
import { EVENT_DESCRIPTION_MAX_LENGTH } from "@/domain/events";

interface Props {
  /** The updateEventDescription server action, passed down from the page. */
  action: SaveAction;
  eventId: string;
  initialText: string;
}

/** Description editor on the event page, with the text-answer style counter. */
export function EventDescriptionForm({ action, eventId, initialText }: Props) {
  const [text, setText] = useState(initialText);
  const overCap = text.length > EVENT_DESCRIPTION_MAX_LENGTH;
  const { formProps, confirmation, error, errorId, fieldProps } = useSaveForm({ action });

  return (
    <form {...formProps} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="eventId" value={eventId} />
      <label htmlFor="event-description" className="text-muted">
        Description (Markdown; shown to participants on their respond page)
      </label>
      <textarea
        id="event-description"
        name="description"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        {...fieldProps("description")}
        className="w-full rounded border border-edge-strong bg-field px-2 py-1 text-sm aria-invalid:border-error"
      />
      <p className={`text-xs ${overCap ? "text-error" : "text-faint"}`}>
        {text.length}/{EVENT_DESCRIPTION_MAX_LENGTH}
      </p>
      <div>
        <SaveButton className={SECONDARY_SM} confirmText="Saved" confirmation={confirmation}>
          Save
        </SaveButton>
        <SaveMessage error={error} id={errorId} />
      </div>
    </form>
  );
}
