"use client";

import { useState } from "react";
import { EVENT_DESCRIPTION_MAX_LENGTH } from "@/domain/events";

interface Props {
  /** The updateEventDescription server action, passed down from the page. */
  action: (formData: FormData) => void | Promise<void>;
  eventId: string;
  initialText: string;
}

/** Description editor on the event page, with the text-answer style counter. */
export function EventDescriptionForm({ action, eventId, initialText }: Props) {
  const [text, setText] = useState(initialText);
  const overCap = text.length > EVENT_DESCRIPTION_MAX_LENGTH;

  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
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
        className="w-full rounded border border-edge-strong bg-field px-2 py-1 text-sm"
      />
      <p className={`text-xs ${overCap ? "text-error" : "text-faint"}`}>
        {text.length}/{EVENT_DESCRIPTION_MAX_LENGTH}
      </p>
      <div>
        <button
          type="submit"
          className="rounded border border-edge-strong px-2 py-1 text-xs hover:bg-btn-secondary-hover disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </form>
  );
}
