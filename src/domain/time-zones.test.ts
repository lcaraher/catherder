import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTimeZoneOptions,
  COMMON_ZONE_IDS,
  groupTimeZoneOptions,
  matchesZoneQuery,
  type TimeZoneOption,
} from "./time-zones.ts";

// Hand-built options so matcher tests don't depend on the runtime's ICU data.
function option(overrides: Partial<TimeZoneOption> & { id: string }): TimeZoneOption {
  const city = (overrides.id.split("/").pop() ?? "").replaceAll("_", " ");
  return {
    city,
    abbreviation: "",
    abbreviations: [],
    offset: "",
    label: `${city} (${overrides.id})`,
    ...overrides,
  };
}

const newYork = option({
  id: "America/New_York",
  abbreviation: "EST",
  abbreviations: ["EST", "EDT"],
  offset: "UTC−5",
  label: "New York — EST, UTC−5 (America/New_York)",
});
const losAngeles = option({
  id: "America/Los_Angeles",
  abbreviation: "PDT",
  abbreviations: ["PST", "PDT"],
  offset: "UTC−7",
  label: "Los Angeles — PDT, UTC−7 (America/Los_Angeles)",
});
const brussels = option({
  id: "Europe/Brussels",
  abbreviation: "GMT+1",
  offset: "UTC+1",
  label: "Brussels — GMT+1, UTC+1 (Europe/Brussels)",
});

describe("matchesZoneQuery", () => {
  it("matches an abbreviation, case-insensitively", () => {
    assert.equal(matchesZoneQuery(newYork, "EST"), true);
    assert.equal(matchesZoneQuery(newYork, "est"), true);
    assert.equal(matchesZoneQuery(losAngeles, "pdt"), true);
    assert.equal(matchesZoneQuery(brussels, "pdt"), false);
  });

  it("matches the out-of-season abbreviation, not just the current one", () => {
    // newYork's label currently says EST; EDT only appears in abbreviations.
    assert.equal(matchesZoneQuery(newYork, "EDT"), true);
    assert.equal(matchesZoneQuery(losAngeles, "pst"), true);
  });

  it("matches a city whose id uses underscores, searched with spaces", () => {
    assert.equal(matchesZoneQuery(newYork, "new york"), true);
    assert.equal(matchesZoneQuery(losAngeles, "los angeles"), true);
  });

  it("matches the raw id, underscores included", () => {
    assert.equal(matchesZoneQuery(newYork, "New_York"), true);
    assert.equal(matchesZoneQuery(newYork, "america/new"), true);
  });

  it("matches a plain city name", () => {
    assert.equal(matchesZoneQuery(brussels, "brussels"), true);
    assert.equal(matchesZoneQuery(brussels, "BRUSSELS"), true);
  });

  it("matches against the label", () => {
    assert.equal(matchesZoneQuery(newYork, "utc−5"), true);
  });

  it("rejects a query that hits nothing", () => {
    assert.equal(matchesZoneQuery(newYork, "tokyo"), false);
  });

  it("matches everything on an empty or whitespace query", () => {
    assert.equal(matchesZoneQuery(newYork, ""), true);
    assert.equal(matchesZoneQuery(brussels, "   "), true);
  });
});

describe("buildTimeZoneOptions", () => {
  // A fixed winter instant so the US east coast is deterministically on EST.
  const january = new Date("2026-01-15T12:00:00Z");

  it("derives city, abbreviation, offset and label from Intl", () => {
    const [ny] = buildTimeZoneOptions(["America/New_York"], january);
    assert.equal(ny.city, "New York");
    assert.equal(ny.abbreviation, "EST");
    assert.equal(ny.offset, "UTC−5");
    assert.equal(ny.label, "New York — EST, UTC−5 (America/New_York)");
  });

  it("uses the last id segment for nested ids", () => {
    const [ba] = buildTimeZoneOptions(["America/Argentina/Buenos_Aires"], january);
    assert.equal(ba.city, "Buenos Aires");
  });

  it("formats half-hour offsets", () => {
    const [kolkata] = buildTimeZoneOptions(["Asia/Kolkata"], january);
    assert.equal(kolkata.offset, "UTC+5:30");
  });
});

describe("year-round abbreviations", () => {
  // A September "now": the US east coast is on EDT, so its EST form only
  // exists because both January and July are sampled regardless of "now".
  const september = new Date("2026-09-13T12:00:00Z");

  it("matches both EST and EDT for New York with a September now", () => {
    const [ny] = buildTimeZoneOptions(["America/New_York"], september);
    assert.deepEqual([...ny.abbreviations].sort(), ["EDT", "EST"]);
    assert.equal(matchesZoneQuery(ny, "EST"), true);
    assert.equal(matchesZoneQuery(ny, "EDT"), true);
  });

  it("matches both PST and PDT for Los Angeles", () => {
    const [la] = buildTimeZoneOptions(["America/Los_Angeles"], september);
    assert.equal(matchesZoneQuery(la, "PST"), true);
    assert.equal(matchesZoneQuery(la, "PDT"), true);
  });

  it("gives a zone without DST a single abbreviation that still matches", () => {
    const [phoenix] = buildTimeZoneOptions(["America/Phoenix"], september);
    assert.deepEqual(phoenix.abbreviations, ["MST"]);
    assert.equal(matchesZoneQuery(phoenix, "MST"), true);
  });

  it("keeps both forms for a southern-hemisphere zone", () => {
    // Sydney's DST months are inverted (daylight in January, standard in
    // July); en-US ICU has no letter names for it, so assert on whatever
    // two forms Intl produces rather than hard-coding them.
    const [sydney] = buildTimeZoneOptions(["Australia/Sydney"], september);
    assert.equal(sydney.abbreviations.length, 2);
    for (const abbreviation of sydney.abbreviations) {
      assert.equal(matchesZoneQuery(sydney, abbreviation), true);
    }
  });
});

describe("groupTimeZoneOptions", () => {
  const options = buildTimeZoneOptions(
    [
      ...COMMON_ZONE_IDS,
      "America/Bogota",
      "Europe/Paris",
      "Asia/Tokyo",
      "Antarctica/Palmer",
      "UTC",
    ],
    new Date("2026-01-15T12:00:00Z"),
  );
  const groups = groupTimeZoneOptions(options);

  it("puts the Common group first, in COMMON_ZONE_IDS order", () => {
    assert.equal(groups[0].heading, "Common");
    assert.deepEqual(
      groups[0].options.map((o) => o.id),
      [...COMMON_ZONE_IDS],
    );
  });

  it("groups the rest by region and never duplicates a common zone", () => {
    const americas = groups.find((g) => g.heading === "Americas");
    assert.deepEqual(americas?.options.map((o) => o.id), ["America/Bogota"]);
    const europe = groups.find((g) => g.heading === "Europe");
    assert.deepEqual(europe?.options.map((o) => o.id), ["Europe/Paris"]);
  });

  it("sends unrecognized prefixes to Other and drops empty groups", () => {
    const other = groups.find((g) => g.heading === "Other");
    assert.deepEqual(
      other?.options.map((o) => o.id),
      ["Antarctica/Palmer", "UTC"],
    );
    assert.equal(groups.some((g) => g.heading === "Indian"), false);
  });
});
