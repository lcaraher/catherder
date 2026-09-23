"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Pane } from "@/components/pane";
import { SECONDARY_SM } from "@/components/button-classes";
import {
  matchesZoneQuery,
  type TimeZoneGroup,
  type TimeZoneOption,
} from "@/domain/time-zones";

interface Props {
  /** Server-prepared groups (Common first, then regions). */
  groups: TimeZoneGroup[];
  initialZoneId: string;
  /**
   * The device zone the user chose to ignore; the mismatch banner stays
   * hidden while the detected zone equals it.
   */
  initialDismissedZone: string | null;
  /** One line shown under the zone. */
  hint?: string;
}


// The device zone never changes within a visit; the server snapshot is
// null so server HTML and the hydration render agree.
const subscribeNever = () => () => {};
const getDeviceZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
const getServerDeviceZone = () => null;

/**
 * Saved time zone with a searchable picker and a device-mismatch banner.
 * All state is local; sibling components never re-render on a zone change.
 */
export function TimeZonePicker({
  groups,
  initialZoneId,
  initialDismissedZone,
  hint,
}: Props) {
  const [zoneId, setZoneId] = useState(initialZoneId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dismissedZone, setDismissedZone] = useState(initialDismissedZone);
  const deviceZone = useSyncExternalStore(
    subscribeNever,
    getDeviceZone,
    getServerDeviceZone,
  );

  const optionById = useMemo(() => {
    const map = new Map<string, TimeZoneOption>();
    for (const group of groups) {
      for (const option of group.options) map.set(option.id, option);
    }
    return map;
  }, [groups]);

  const cityOf = (id: string): string =>
    optionById.get(id)?.city ?? (id.split("/").pop() ?? id).replaceAll("_", " ");
  const labelOf = (id: string): string => optionById.get(id)?.label ?? id;

  async function save(id: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/me/time-zone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeZone: id }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `save failed (${response.status})`);
      }
      setZoneId(id);
      // The server clears the stored dismissal with any zone change; mirror it.
      setDismissedZone(null);
      setOpen(false);
      setQuery("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your time zone.",
      );
    }
    setSaving(false);
  }

  // Stores the detected zone server-side; the banner stays gone until the
  // device zone changes again.
  async function dismissDeviceZone(detected: string) {
    setDismissedZone(detected);
    try {
      await fetch("/api/me/dismissed-device-zone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceZone: detected }),
      });
    } catch {
      // Already hidden this visit; a failed save just resurfaces it next load.
    }
  }

  const visibleGroups = groups
    .map((group) => ({
      heading: group.heading,
      options: group.options.filter((option) =>
        matchesZoneQuery(option, query),
      ),
    }))
    .filter((group) => group.options.length > 0);

  const showSuggestion =
    deviceZone !== null && deviceZone !== zoneId && deviceZone !== dismissedZone;

  return (
    <Pane as="div" className="mb-6 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">
          Your time zone:
        </span>
        <span className="font-medium">{labelOf(zoneId)}</span>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className={SECONDARY_SM}
        >
          {open ? "Close" : "Change"}
        </button>
        {saving && <span className="text-xs text-faint">Saving…</span>}
      </div>
      {hint && (
        <p className="mt-1 text-xs text-hint">{hint}</p>
      )}
      {error && <p className="mt-1 text-xs text-error">{error}</p>}

      {showSuggestion && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-notice-warn-border bg-notice-warn px-2 py-1.5 text-xs text-notice-warn-text">
          <span>
            Your device says {cityOf(deviceZone)}, your profile says{" "}
            {cityOf(zoneId)}.
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => save(deviceZone)}
            className={SECONDARY_SM}
          >
            Use {cityOf(deviceZone)}
          </button>
          <button
            type="button"
            onClick={() => dismissDeviceZone(deviceZone)}
            className={SECONDARY_SM}
          >
            Keep {cityOf(zoneId)}
          </button>
        </div>
      )}

      {open && (
        <div className="mt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search by city, zone or abbreviation — e.g. "EST", "Brussels"'
            aria-label="Search time zones"
            className="w-full rounded border border-edge-strong bg-field px-2 py-1 text-sm"
          />
          <div className="mt-2 max-h-72 overflow-y-auto rounded border border-edge">
            {visibleGroups.length === 0 ? (
              <p className="px-2 py-2 text-xs text-hint">
                No matching time zones.
              </p>
            ) : (
              visibleGroups.map((group) => (
                <div key={group.heading}>
                  <p className="sticky top-0 bg-surface-raised px-2 py-1 text-xs font-semibold text-muted">
                    {group.heading}
                  </p>
                  <ul>
                    {group.options.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => save(option.id)}
                          className={`w-full px-2 py-1 text-left text-sm hover:bg-btn-secondary-hover disabled:opacity-40 ${
                            option.id === zoneId
                              ? "bg-selected font-medium"
                              : ""
                          }`}
                        >
                          {option.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Pane>
  );
}
