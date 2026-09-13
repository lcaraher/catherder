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
  /** One line under the zone, telling the reader why it matters here. */
  hint?: string;
}

const smallButton =
  "rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900";

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
export function TimeZonePicker({ groups, initialZoneId, hint }: Props) {
  const [zoneId, setZoneId] = useState(initialZoneId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
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
      setOpen(false);
      setQuery("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your time zone.",
      );
    }
    setSaving(false);
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
    deviceZone !== null && deviceZone !== zoneId && !suggestionDismissed;

  return (
    <div className="mb-6 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-zinc-600 dark:text-zinc-400">
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
        {saving && <span className="text-xs text-zinc-400">Saving…</span>}
      </div>
      {hint && (
        <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {showSuggestion && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
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
            onClick={() => setSuggestionDismissed(true)}
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
            className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="mt-2 max-h-72 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-800">
            {visibleGroups.length === 0 ? (
              <p className="px-2 py-2 text-xs text-zinc-500">
                No matching time zones.
              </p>
            ) : (
              visibleGroups.map((group) => (
                <div key={group.heading}>
                  <p className="sticky top-0 bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {group.heading}
                  </p>
                  <ul>
                    {group.options.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => save(option.id)}
                          className={`w-full px-2 py-1 text-left text-sm hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-900 ${
                            option.id === zoneId
                              ? "bg-emerald-50 font-medium dark:bg-emerald-950/50"
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
