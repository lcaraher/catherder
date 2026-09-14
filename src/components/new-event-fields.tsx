"use client";

import { useState } from "react";

const inputClass =
  "w-full rounded border border-edge-strong bg-field px-3 py-2 text-sm";

/**
 * The mode-dependent middle of the New event form: mode, target length, and
 * — in GameMaster groups mode only — the group-size bounds. Single activity
 * has no groups, so those inputs disappear (and the server ignores them in
 * that mode regardless).
 */
export function NewEventFields() {
  const [mode, setMode] = useState("GM_GROUPS");

  return (
    <>
      <div>
        <label htmlFor="mode" className="mb-1 block text-muted">
          Mode
        </label>
        <select
          id="mode"
          name="mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className={inputClass}
        >
          <option value="GM_GROUPS">GameMaster groups</option>
          <option value="SINGLE_ACTIVITY">Single activity</option>
        </select>
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
      {mode === "GM_GROUPS" && (
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
