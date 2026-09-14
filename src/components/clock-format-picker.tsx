"use client";

import { useState } from "react";
import type { ClockFormat } from "@/domain/availability";

const OPTIONS: { value: ClockFormat; label: string }[] = [
  { value: "TWELVE_HOUR", label: "12-hour (7:30 PM)" },
  { value: "TWENTY_FOUR_HOUR", label: "24-hour (19:30)" },
];

/**
 * Two radio buttons for the user's clock format, saving on change with the
 * same feedback pattern as the time-zone picker. State is local: the grids
 * on the page keep showing the format the page was rendered with until the
 * next load — like a zone change, nothing on screen is re-rendered or reset.
 */
export function ClockFormatPicker({
  initialFormat,
}: {
  initialFormat: ClockFormat;
}) {
  const [format, setFormat] = useState<ClockFormat>(initialFormat);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(value: ClockFormat) {
    const previous = format;
    setFormat(value);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/me/clock-format", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clockFormat: value }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `save failed (${response.status})`);
      }
    } catch (err) {
      setFormat(previous);
      setError(
        err instanceof Error ? err.message : "Could not save your clock format.",
      );
    }
    setSaving(false);
  }

  return (
    <fieldset className="mb-6 rounded border border-edge p-3 text-sm">
      <legend className="px-1 text-muted">Clock format</legend>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="clock-format"
              checked={format === option.value}
              disabled={saving}
              onChange={() => save(option.value)}
            />
            {option.label}
          </label>
        ))}
        {saving && <span className="text-xs text-faint">Saving…</span>}
      </div>
      <p className="mt-1 text-xs text-hint">
        Applies after the page reloads.
      </p>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </fieldset>
  );
}
