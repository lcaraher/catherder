"use client";

import { SECONDARY_SM } from "@/components/button-classes";
import { Checkbox, Select } from "@/components/form-controls";
import { SaveButton, SaveMessage, useSaveForm, type SaveAction } from "@/components/save-form";

const inputClass =
  "rounded border border-edge-strong bg-field px-2 py-1 text-sm aria-invalid:border-error";
// Select draws its own border and radius.
const selectClass = "px-2 py-1 text-sm aria-invalid:border-error";

interface Props {
  /** The updateEvent server action, passed down from the page. */
  action: SaveAction;
  event: {
    id: string;
    name: string;
    mode: "MULTI_GROUP" | "SINGLE_ACTIVITY";
    requiredSlots: number;
    minGroupSize: number | null;
    maxGroupSize: number | null;
    organizerUserId: string;
    organizerParticipates: boolean;
  };
  participants: { userId: string; displayName: string }[];
}

/** The Edit event form on the manage page. */
export function EditEventForm({ action, event, participants }: Props) {
  const { formProps, confirmation, error, errorId, fieldProps } = useSaveForm({ action });

  return (
    <form {...formProps} className="flex flex-col gap-3">
      <input type="hidden" name="eventId" value={event.id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="edit-name" className="mb-1 block text-muted">
            Name
          </label>
          <input
            id="edit-name"
            name="name"
            defaultValue={event.name}
            required
            {...fieldProps("name")}
            className={`w-full ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="edit-targetHours" className="mb-1 block text-muted">
            Target session length (hours)
          </label>
          <input
            id="edit-targetHours"
            name="targetHours"
            type="number"
            min={0.5}
            step={0.5}
            defaultValue={event.requiredSlots / 2}
            required
            {...fieldProps("targetHours")}
            className={inputClass}
          />
        </div>
        {event.mode === "MULTI_GROUP" && (
          <>
            <div>
              <label htmlFor="edit-minGroupSize" className="mb-1 block text-muted">
                Min group size
              </label>
              <input
                id="edit-minGroupSize"
                name="minGroupSize"
                type="number"
                min={1}
                defaultValue={event.minGroupSize ?? ""}
                {...fieldProps("minGroupSize")}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="edit-maxGroupSize" className="mb-1 block text-muted">
                Max group size
              </label>
              <input
                id="edit-maxGroupSize"
                name="maxGroupSize"
                type="number"
                min={1}
                defaultValue={event.maxGroupSize ?? ""}
                {...fieldProps("maxGroupSize")}
                className={inputClass}
              />
            </div>
          </>
        )}
        <div>
          <label htmlFor="edit-organizerUserId" className="mb-1 block text-muted">
            Organizer
          </label>
          {/* Options are this event's participants; updateEvent rejects anyone else. */}
          <Select
            id="edit-organizerUserId"
            name="organizerUserId"
            defaultValue={event.organizerUserId}
            {...fieldProps("organizerUserId")}
            className={selectClass}
          >
            {participants.map((participant) => (
              <option key={participant.userId} value={participant.userId}>
                {participant.displayName}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-muted">
          <Checkbox name="organizerParticipates" defaultChecked={event.organizerParticipates} />
          Organizer also participates
        </label>
        <button
          type="button"
          aria-label="What does this do?"
          title="When on, the organizer takes part like any other member: they answer the questions and submit their availability for this event. When off, only their availability is used, and they are never asked to respond."
          className={SECONDARY_SM}
        >
          ?
        </button>
      </div>
      <p className="text-xs text-hint">
        Target session length is a starting point for grouping — you can
        change it later, and it does not limit what participants submit.
      </p>
      <div>
        <SaveButton className={SECONDARY_SM} confirmText="Saved" confirmation={confirmation}>
          Save changes
        </SaveButton>
        <SaveMessage error={error} id={errorId} />
      </div>
    </form>
  );
}
