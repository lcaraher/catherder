"use client";

import { createEvent } from "@/app/e/[eventId]/manage/actions";
import { PRIMARY } from "@/components/button-classes";
import { NewEventFields } from "@/components/new-event-fields";
import { SaveMessage, useSaveForm } from "@/components/save-form";

const inputClass =
  "w-full rounded border border-edge-strong bg-field px-3 py-2 text-sm aria-invalid:border-error";

/** The new-event form; posts to createEvent, which opens the new event on success. */
export function NewEventForm() {
  const { formProps, error, errorId, fieldProps } = useSaveForm({
    action: createEvent,
  });

  return (
    <form {...formProps} className="flex flex-col gap-4 text-sm">
      <div>
        <label htmlFor="name" className="mb-1 block text-muted">
          Name
        </label>
        <input id="name" name="name" required {...fieldProps("name")} className={inputClass} />
      </div>
      <NewEventFields fieldProps={fieldProps} />
      <div>
        <button type="submit" className={PRIMARY}>
          Create event
        </button>
        <SaveMessage error={error} id={errorId} />
      </div>
    </form>
  );
}
