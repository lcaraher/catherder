"use client";

import { useState } from "react";
import { Checkbox, Select } from "@/components/form-controls";
import { SECONDARY_SM } from "@/components/button-classes";

const inputClass =
  "w-full rounded border border-edge-strong bg-field px-3 py-2 text-sm";

/**
 * Mode, organizer participation, target length, and (multi-group only) the
 * group-size bounds; the server also ignores group sizes in single activity.
 */
export function NewEventFields() {
  const [mode, setMode] = useState("MULTI_GROUP");

  return (
    <>
      <div>
        <label htmlFor="mode" className="mb-1 block text-muted">
          Mode
        </label>
        <Select
          id="mode"
          name="mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="px-3 py-2 text-sm"
          wrapperClassName="w-full"
        >
          <option value="MULTI_GROUP">Multi-group activity</option>
          <option value="SINGLE_ACTIVITY">Single activity</option>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-muted">
          <Checkbox name="organizerParticipates" />
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
      <div>
        <label htmlFor="targetHours" className="mb-1 block text-muted">
          Target session length (hours)
        </label>
        <input
          id="targetHours"
          name="targetHours"
          type="number"
          min={0.5}
          step={0.5}
          required
          className={inputClass}
        />
        <p className="mt-1 text-xs text-hint">
          A starting point for grouping — you can change it later, and it
          does not limit what participants submit.
        </p>
      </div>
      {mode === "MULTI_GROUP" && (
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="minGroupSize" className="mb-1 block text-muted">
              Min group size (optional)
            </label>
            <input
              id="minGroupSize"
              name="minGroupSize"
              type="number"
              min={1}
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label htmlFor="maxGroupSize" className="mb-1 block text-muted">
              Max group size (optional)
            </label>
            <input
              id="maxGroupSize"
              name="maxGroupSize"
              type="number"
              min={1}
              className={inputClass}
            />
          </div>
        </div>
      )}
    </>
  );
}
