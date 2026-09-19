import { createEvent } from "@/app/w/[workspaceId]/events/actions";
import { EventDestinationSelect } from "@/components/event-destination-select";
import { NewEventFields } from "@/components/new-event-fields";

const inputClass =
  "w-full rounded border border-edge-strong bg-field px-3 py-2 text-sm";

/**
 * The new-event form. With a null workspaceId nothing is posted for it and
 * createEvent decides where the event lands.
 */
export function NewEventForm({
  workspaceId,
  destinations,
  error,
}: {
  workspaceId: string | null;
  destinations: { workspaceId: string; name: string }[];
  error?: string;
}) {
  return (
    <>
      {error && (
        <p className="mb-4 rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
          {error}
        </p>
      )}
      <form action={createEvent} className="flex flex-col gap-4 text-sm">
        {workspaceId !== null && (
          <input type="hidden" name="workspaceId" value={workspaceId} />
        )}
        {workspaceId !== null && destinations.length > 1 && (
          <div>
            <label htmlFor="destination" className="mb-1 block text-muted">
              Create in
            </label>
            <EventDestinationSelect
              id="destination"
              currentWorkspaceId={workspaceId}
              options={destinations}
            />
          </div>
        )}
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
            className="rounded bg-btn-primary px-4 py-2 font-medium text-on-primary hover:bg-btn-primary-hover"
          >
            Create event
          </button>
        </div>
      </form>
    </>
  );
}
