// Pure time-zone presentation logic: no framework, adapter, or I/O imports.
// Availability is stored as local wall-clock plus an IANA zone name; these
// helpers only present and filter zone choices, never convert stored times.

/** Zones pinned to the top of the picker, in this exact order. */
export const COMMON_ZONE_IDS: readonly string[] = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Brussels",
  "Europe/Helsinki",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/**
 * Region groups for every zone not in COMMON_ZONE_IDS, keyed by IANA prefix
 * and shown in this order. `prefix: null` is the catch-all for ids that
 * match no listed prefix (Antarctica, Etc, UTC, …).
 */
export const REGION_ORDER: readonly { prefix: string | null; heading: string }[] =
  [
    { prefix: "America", heading: "Americas" },
    { prefix: "Europe", heading: "Europe" },
    { prefix: "Asia", heading: "Asia" },
    { prefix: "Africa", heading: "Africa" },
    { prefix: "Australia", heading: "Australia" },
    { prefix: "Pacific", heading: "Pacific" },
    { prefix: "Atlantic", heading: "Atlantic" },
    { prefix: "Indian", heading: "Indian" },
    { prefix: null, heading: "Other" },
  ];

/** One prepared picker entry; built on the server, filtered on the client. */
export interface TimeZoneOption {
  id: string;
  /** Last id segment with underscores as spaces, e.g. "New York". */
  city: string;
  /** Current abbreviation, e.g. "EDT" (or "GMT+2" where ICU has no name). */
  abbreviation: string;
  /**
   * Every abbreviation the zone uses over a year, de-duplicated — standard
   * and daylight forms, e.g. ["EST", "EDT"]; one entry for zones without
   * DST. A plain array (not a Set) so the option survives the server →
   * client props boundary as JSON.
   */
  abbreviations: string[];
  /** Current offset, e.g. "UTC−4" or "UTC+5:30". */
  offset: string;
  /** Full display line, e.g. "New York — EDT, UTC−4 (America/New_York)". */
  label: string;
}

export interface TimeZoneGroup {
  heading: string;
  options: TimeZoneOption[];
}

/**
 * Case-insensitive match against the zone id, the id with underscores as
 * spaces, the city, the label, and every abbreviation the zone uses over a
 * year — so "EST" finds New York even in September, when its label says
 * "EDT". An empty query matches everything.
 */
export function matchesZoneQuery(option: TimeZoneOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return [
    option.id,
    option.id.replaceAll("_", " "),
    option.city,
    option.label,
    option.abbreviation,
    ...option.abbreviations,
  ].some((haystack) => haystack.toLowerCase().includes(q));
}

function timeZoneNamePart(
  zoneId: string,
  style: "short" | "shortOffset",
  now: Date,
): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        timeZone: zoneId,
        timeZoneName: style,
      })
        .formatToParts(now)
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * The zone's short abbreviation sampled at fixed mid-January and mid-July
 * instants of `now`'s year, de-duplicated. Sampling both solstice-ish points
 * catches the standard and daylight forms in either hemisphere; a zone
 * without DST yields a single entry. Mid-month noon UTC keeps both samples
 * safely clear of every real-world DST transition date.
 */
function yearRoundAbbreviations(zoneId: string, now: Date): string[] {
  const year = now.getUTCFullYear();
  const samples = [
    new Date(Date.UTC(year, 0, 15, 12)),
    new Date(Date.UTC(year, 6, 15, 12)),
  ];
  return [
    ...new Set(
      samples
        .map((instant) => timeZoneNamePart(zoneId, "short", instant))
        .filter((abbreviation) => abbreviation !== ""),
    ),
  ];
}

// "GMT-4" -> "UTC−4", "GMT+5:30" -> "UTC+5:30", bare "GMT" -> "UTC+0".
function formatOffset(gmtOffset: string): string {
  if (gmtOffset === "" || gmtOffset === "GMT" || gmtOffset === "UTC") {
    return "UTC+0";
  }
  return gmtOffset.replace(/^(GMT|UTC)/, "UTC").replace("-", "−");
}

/**
 * Prepares picker options for the given zone ids at the given instant. The
 * abbreviation and offset always come from Intl.DateTimeFormat — never from
 * a hard-coded table — so DST is right for "now". Callers pass
 * Intl.supportedValuesOf("timeZone"); tests pass fixed ids and dates.
 */
export function buildTimeZoneOptions(
  zoneIds: readonly string[],
  now: Date = new Date(),
): TimeZoneOption[] {
  return zoneIds.map((id) => {
    const city = (id.split("/").pop() ?? id).replaceAll("_", " ");
    const abbreviation = timeZoneNamePart(id, "short", now);
    const offset = formatOffset(timeZoneNamePart(id, "shortOffset", now));
    return {
      id,
      city,
      abbreviation,
      abbreviations: yearRoundAbbreviations(id, now),
      offset,
      label: `${city} — ${abbreviation}, ${offset} (${id})`,
    };
  });
}

/**
 * Splits prepared options into the Common group (in COMMON_ZONE_IDS order)
 * followed by REGION_ORDER groups of everything else. Empty groups are
 * dropped.
 */
export function groupTimeZoneOptions(
  options: readonly TimeZoneOption[],
): TimeZoneGroup[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  const common = COMMON_ZONE_IDS.flatMap((id) => {
    const option = byId.get(id);
    return option ? [option] : [];
  });
  const commonIds = new Set(COMMON_ZONE_IDS);
  const rest = options.filter((option) => !commonIds.has(option.id));

  const groups: TimeZoneGroup[] = [];
  if (common.length > 0) groups.push({ heading: "Common", options: common });
  for (const { prefix, heading } of REGION_ORDER) {
    const members = rest.filter((option) =>
      prefix === null
        ? !REGION_ORDER.some(
            (region) =>
              region.prefix !== null &&
              option.id.startsWith(`${region.prefix}/`),
          )
        : option.id.startsWith(`${prefix}/`),
    );
    if (members.length > 0) groups.push({ heading, options: members });
  }
  return groups;
}
