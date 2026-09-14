"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
   * The device zone the user chose to ignore earlier (User.
   * dismissedDeviceZone); the mismatch banner stays hidden while the
   * detected zone equals it.
   */
  initialDismissedZone: string | null;
  /** One line under the zone, telling the reader why it matters here. */
  hint?: string;
}

const smallButton =
  "rounded border border-edge-strong px-2 py-1 text-xs hover:bg-btn-secondary-hover disabled:opacity-40";

// The device zone never changes within a page visit, so the store never
// notifies; the server snapshot is null so server HTML and the hydration
// render agree, and the real value appears on the first client render after.
const subscribeNever = () => () => {};
const getDeviceZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
const getServerDeviceZone = () => null;

/**
 * Shows the saved time zone, offers a searchable grouped picker, and — when
 * the device's zone differs — suggests both without ever changing anything
 * uninvited. Saving POSTs to /api/me/time-zone; all state is local, so
 * sibling components (like a half-painted week grid) are never re-rendered
 * or reset by a zone change.
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
      // The server clears the stored dismissal with any zone change; mirror
      // that so the banner re-evaluates against the new zone right away.
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

  // "Keep <profile zone>": remember the detected zone server-side so the
  // banner stays gone on future loads, until the device zone changes again.
  async function dismissDeviceZone(detected: string) {
    setDismissedZone(detected);
    try {
      await fetch("/api/me/dismissed-device-zone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceZone: detected }),
      });
    } catch {
      // The banner is already hidden for this visit; if the save failed it
      // simply reappears on the next page load.
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
    <div className="mb-6 rounded border border-edge p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">
          Your time zone:
        </span>
        <span className="font-medium">{labelOf(zoneId)}</span>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className={smallButton}
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
            className={smallButton}
          >
            Use {cityOf(deviceZone)}
          </button>
          <button
            type="button"
            onClick={() => dismissDeviceZone(deviceZone)}
            className={smallButton}
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
    </div>
  );
}
