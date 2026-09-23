import { createEvent } from "@/app/e/[eventId]/manage/actions";
import { PRIMARY } from "@/components/button-classes";
import { NewEventFields } from "@/components/new-event-fields";

const inputClass =
  "w-full rounded border border-edge-strong bg-field px-3 py-2 text-sm";

/** The new-event form; posts to createEvent. */
export function NewEventForm({ error }: { error?: string }) {
  return (
    <>
      {error && (
        <p className="mb-4 rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
          {error}
        </p>
      )}
      <form action={createEvent} className="flex flex-col gap-4 text-sm">
        <div>
          <label htmlFor="name" className="mb-1 block text-muted">
            Name
          </label>
          <input id="name" name="name" required className={inputClass} />
        </div>
        <NewEventFields />
        <div>
          <button
            type="submit"
            className={PRIMARY}
          >
            Create event
          </button>
        </div>
      </form>
    </>
  );
}
