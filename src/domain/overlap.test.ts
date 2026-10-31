import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AvailabilityRange } from "./availability.ts";
import {
  collapseOverlapToHours,
  computeOverlapGrid,
  foldEmptyRows,
  heatRanges,
  heatStep,
  moveWeekSlot,
  splitOrganizer,
  type OverlapParticipant,
} from "./overlap.ts";

// A fixed "now" so the reference week is deterministic. The
// grid tests use fixed-offset zones (Etc/*, Asia/*), so DST cannot shift them.
const NOW = new Date("2026-09-13T12:00:00Z");

function participant(
  overrides: Partial<OverlapParticipant> & { userId: string },
): OverlapParticipant {
  return {
    displayName: overrides.userId,
    isOrganizer: false,
    timeZone: "UTC",
    ranges: [],
    ...overrides,
  };
}

const range = (
  weekday: number,
  startSlot: number,
  endSlot: number,
  status: "AVAILABLE" | "TENTATIVE" = "AVAILABLE",
): AvailabilityRange => ({ weekday, startSlot, endSlot, status });

describe("computeOverlapGrid", () => {
  it("is the identity when participant and viewer share a zone", () => {
    // Monday 18:00–20:00 (slots 36–40).
    const { grid } = computeOverlapGrid(
      [participant({ userId: "a", ranges: [range(0, 36, 40)] })],
      "UTC",
      NOW,
    );
    for (let slot = 36; slot < 40; slot++) {
      assert.deepEqual(grid[0][slot], { available: ["a"], tentative: [] });
    }
    assert.deepEqual(grid[0][35], { available: [], tentative: [] });
    assert.deepEqual(grid[0][40], { available: [], tentative: [] });
  });

  it("shifts a participant three hours behind the viewer three hours later", () => {
    // Etc/GMT+3 is UTC−3 (the Etc sign convention is inverted). Their
    // Monday 12:00 (slot 24) is the viewer's Monday 15:00 (slot 30).
    const { grid } = computeOverlapGrid(
      [
        participant({
          userId: "a",
          timeZone: "Etc/GMT+3",
          ranges: [range(0, 24, 26)],
        }),
      ],
      "UTC",
      NOW,
    );
    assert.deepEqual(grid[0][30].available, ["a"]);
    assert.deepEqual(grid[0][31].available, ["a"]);
    assert.deepEqual(grid[0][24].available, []);
  });

  it("wraps Sunday late night forward into Monday", () => {
    // UTC−3 participant, Sunday 22:00–24:00 → viewer Monday 01:00–03:00.
    const { grid } = computeOverlapGrid(
      [
        participant({
          userId: "a",
          timeZone: "Etc/GMT+3",
          ranges: [range(6, 44, 48)],
        }),
      ],
      "UTC",
      NOW,
    );
    for (let slot = 2; slot < 6; slot++) {
      assert.deepEqual(grid[0][slot].available, ["a"]);
    }
    assert.deepEqual(grid[6][44].available, []);
  });

  it("wraps Monday early morning back into Sunday", () => {
    // UTC+3 participant, Monday 01:00–02:00 → viewer Sunday 22:00–23:00.
    const { grid } = computeOverlapGrid(
      [
        participant({
          userId: "a",
          timeZone: "Etc/GMT-3",
          ranges: [range(0, 2, 4)],
        }),
      ],
      "UTC",
      NOW,
    );
    assert.deepEqual(grid[6][44].available, ["a"]);
    assert.deepEqual(grid[6][45].available, ["a"]);
    assert.deepEqual(grid[0][2].available, []);
  });

  it("keeps available and tentative separate within one cell", () => {
    const { grid } = computeOverlapGrid(
      [
        participant({ userId: "a", ranges: [range(2, 20, 22)] }),
        participant({
          userId: "b",
          ranges: [range(2, 20, 22, "TENTATIVE")],
        }),
      ],
      "UTC",
      NOW,
    );
    assert.deepEqual(grid[2][20], { available: ["a"], tentative: ["b"] });
  });

  it("handles a half-hour-offset zone (Asia/Kolkata)", () => {
    // UTC+5:30: their Monday 12:00 (slot 24) is the viewer's 06:30 (slot 13).
    const { grid } = computeOverlapGrid(
      [
        participant({
          userId: "a",
          timeZone: "Asia/Kolkata",
          ranges: [range(0, 24, 25)],
        }),
      ],
      "UTC",
      NOW,
    );
    assert.deepEqual(grid[0][13].available, ["a"]);
  });

  it("rounds a quarter-hour zone to the nearest half-hour and reports it", () => {
    // Asia/Kathmandu (UTC+5:45) rounds away from zero to +6:00: their
    // Monday 12:00 (slot 24) lands at the viewer's 06:00 (slot 12).
    const { grid, approximated, viewerApproximated } = computeOverlapGrid(
      [
        participant({
          userId: "a",
          timeZone: "Asia/Kathmandu",
          ranges: [range(0, 24, 25)],
        }),
        participant({ userId: "b", ranges: [range(0, 24, 25)] }),
      ],
      "UTC",
      NOW,
    );
    assert.deepEqual(grid[0][12].available, ["a"]);
    assert.deepEqual(approximated, ["a"]);
    assert.equal(viewerApproximated, false);
  });

  it("reports viewerApproximated when the viewer's own zone is rounded", () => {
    const { approximated, viewerApproximated } = computeOverlapGrid(
      [participant({ userId: "a", ranges: [range(0, 24, 25)] })],
      "Asia/Kathmandu",
      NOW,
    );
    assert.equal(viewerApproximated, true);
    assert.deepEqual(approximated, []);
  });
});

describe("splitOrganizer", () => {
  it("with countOrganizer false, removes the organizer from the counts and reports them separately", () => {
    const { grid } = computeOverlapGrid(
      [
        participant({ userId: "org", ranges: [range(0, 36, 37), range(0, 37, 38, "TENTATIVE")] }),
        participant({ userId: "a", ranges: [range(0, 36, 38)] }),
      ],
      "UTC",
      NOW,
    );
    const split = splitOrganizer(grid, "org", false);
    assert.deepEqual(split[0][36], {
      players: { available: ["a"], tentative: [] },
      organizer: "AVAILABLE",
    });
    assert.deepEqual(split[0][37], {
      players: { available: ["a"], tentative: [] },
      organizer: "TENTATIVE",
    });
    // A cell the organizer is not painted in reports organizer null.
    assert.deepEqual(split[0][35], {
      players: { available: [], tentative: [] },
      organizer: null,
    });
  });

  it("with countOrganizer true, keeps the organizer in the counts and still reports them", () => {
    const { grid } = computeOverlapGrid(
      [
        participant({ userId: "org", ranges: [range(0, 36, 37), range(0, 37, 38, "TENTATIVE")] }),
        participant({ userId: "a", ranges: [range(0, 36, 38)] }),
      ],
      "UTC",
      NOW,
    );
    const split = splitOrganizer(grid, "org", true);
    assert.deepEqual(split[0][36], {
      players: { available: ["org", "a"], tentative: [] },
      organizer: "AVAILABLE",
    });
    assert.deepEqual(split[0][37], {
      players: { available: ["a"], tentative: ["org"] },
      organizer: "TENTATIVE",
    });
    assert.deepEqual(split[0][35], {
      players: { available: [], tentative: [] },
      organizer: null,
    });
  });

  it("with organizerUserId null, players equal the input cells and organizer is null", () => {
    const { grid } = computeOverlapGrid(
      [
        participant({ userId: "a", ranges: [range(3, 20, 22)] }),
        participant({ userId: "b", ranges: [range(3, 20, 22, "TENTATIVE")] }),
      ],
      "UTC",
      NOW,
    );
    const split = splitOrganizer(grid, null, false);
    for (let weekday = 0; weekday < grid.length; weekday++) {
      for (let slot = 0; slot < grid[weekday].length; slot++) {
        assert.deepEqual(split[weekday][slot].players, grid[weekday][slot]);
        assert.equal(split[weekday][slot].organizer, null);
      }
    }
  });

  it("does not mutate the input grid", () => {
    const { grid } = computeOverlapGrid(
      [participant({ userId: "org", ranges: [range(0, 36, 38)] })],
      "UTC",
      NOW,
    );
    splitOrganizer(grid, "org", false);
    assert.deepEqual(grid[0][36], { available: ["org"], tentative: [] });
  });
});

describe("collapseOverlapToHours", () => {
  it("applies the hour-collapse rule per participant", () => {
    // 18:00–19:00 (slots 36–37): a available both halves; b first half
    // only (excluded); c available-then-tentative; d tentative both.
    const { grid } = computeOverlapGrid(
      [
        participant({ userId: "a", ranges: [range(0, 36, 38)] }),
        participant({ userId: "b", ranges: [range(0, 36, 37)] }),
        participant({
          userId: "c",
          ranges: [range(0, 36, 37), range(0, 37, 38, "TENTATIVE")],
        }),
        participant({ userId: "d", ranges: [range(0, 36, 38, "TENTATIVE")] }),
      ],
      "UTC",
      NOW,
    );
    const hours = collapseOverlapToHours(grid);
    assert.equal(hours[0].length, 24);
    assert.deepEqual(hours[0][18], { available: ["a"], tentative: ["c", "d"] });
  });

  it("applies the same both-halves rule to the organizer on a split grid", () => {
    // Organizer: 18–19 available, 19–20 available-then-tentative, 20–21
    // first half only. Player a spans 18:00–21:00.
    const { grid } = computeOverlapGrid(
      [
        participant({
          userId: "org",
          ranges: [range(0, 36, 39), range(0, 39, 40, "TENTATIVE"), range(0, 40, 41)],
        }),
        participant({ userId: "a", ranges: [range(0, 36, 42)] }),
      ],
      "UTC",
      NOW,
    );
    const hours = collapseOverlapToHours(splitOrganizer(grid, "org", false));
    assert.equal(hours[0].length, 24);
    assert.deepEqual(hours[0][18], {
      players: { available: ["a"], tentative: [] },
      organizer: "AVAILABLE",
    });
    assert.deepEqual(hours[0][19], {
      players: { available: ["a"], tentative: [] },
      organizer: "TENTATIVE",
    });
    // One painted half-hour out of two: the organizer does not count for
    // the hour.
    assert.deepEqual(hours[0][20], {
      players: { available: ["a"], tentative: [] },
      organizer: null,
    });
  });
});

describe("foldEmptyRows", () => {
  // "K" kept, "." not kept.
  const keptFrom = (pattern: string) => [...pattern].map((c) => c === "K");
  const rows = (...indexes: number[]) =>
    indexes.map((row) => ({ kind: "row" as const, row }));

  it("folds a run at the start", () => {
    assert.deepEqual(foldEmptyRows(keptFrom("...KK"), 2), [
      { kind: "fold", start: 0, end: 3 },
      ...rows(3, 4),
    ]);
  });

  it("folds a run in the middle", () => {
    assert.deepEqual(foldEmptyRows(keptFrom("K...K"), 2), [
      ...rows(0),
      { kind: "fold", start: 1, end: 4 },
      ...rows(4),
    ]);
  });

  it("folds a run at the end", () => {
    assert.deepEqual(foldEmptyRows(keptFrom("KK..."), 2), [
      ...rows(0, 1),
      { kind: "fold", start: 2, end: 5 },
    ]);
  });

  it("keeps a run shorter than minRun as rows", () => {
    assert.deepEqual(foldEmptyRows(keptFrom("K.K..K"), 3), rows(0, 1, 2, 3, 4, 5));
  });

  it("folds a single row with minRun 1", () => {
    assert.deepEqual(foldEmptyRows(keptFrom("K.K"), 1), [
      ...rows(0),
      { kind: "fold", start: 1, end: 2 },
      ...rows(2),
    ]);
  });

  it("with minRun 2, folds a run of two and keeps a run of one", () => {
    assert.deepEqual(foldEmptyRows(keptFrom(".K..K"), 2), [
      ...rows(0, 1),
      { kind: "fold", start: 2, end: 4 },
      ...rows(4),
    ]);
  });

  it("returns every row when no row is kept", () => {
    assert.deepEqual(foldEmptyRows(keptFrom("...."), 1), rows(0, 1, 2, 3));
  });

  it("returns every row when every row is kept", () => {
    assert.deepEqual(foldEmptyRows(keptFrom("KKKK"), 1), rows(0, 1, 2, 3));
  });
});

describe("heatStep", () => {
  // [available, counted, step]
  const cases: [number, number, number][] = [
    [1, 12, 1],
    [2, 12, 1],
    [3, 12, 2],
    [4, 12, 2],
    [5, 12, 3],
    [6, 12, 3],
    [8, 12, 4],
    [10, 12, 5],
    [12, 12, 5],
    [1, 3, 2],
    [2, 3, 4],
    [3, 3, 5],
    [1, 1, 5],
  ];
  for (const [available, counted, step] of cases) {
    it(`${available} of ${counted} is step ${step}`, () => {
      assert.equal(heatStep(available, counted), step);
    });
  }

  it("is 0 when nobody is available", () => {
    assert.equal(heatStep(0, 12), 0);
  });

  it("is 0 when nobody is counted", () => {
    assert.equal(heatStep(0, 0), 0);
    assert.equal(heatStep(2, 0), 0);
  });

  it("clamps an available count above the counted group to 5", () => {
    assert.equal(heatStep(7, 3), 5);
  });
});

describe("heatRanges", () => {
  it("lists the counts behind each step for a group of 12", () => {
    assert.deepEqual(heatRanges(12), ["", "1–2", "3–4", "5–7", "8–9", "10–12"]);
  });

  it("marks the steps a group of 3 never reaches", () => {
    assert.deepEqual(heatRanges(3), ["", "—", "1", "—", "2", "3"]);
  });

  it("agrees with heatStep for every count", () => {
    for (const counted of [1, 2, 3, 5, 7, 12, 40]) {
      const ranges = heatRanges(counted);
      for (let available = 1; available <= counted; available++) {
        const [low, high = low] = ranges[heatStep(available, counted)]
          .split("–")
          .map(Number);
        assert.ok(low <= available && available <= high);
      }
    }
  });
});

describe("moveWeekSlot", () => {
  // 2026-07-01 samples Monday 2026-07-06: New York −4, Chicago −5, London +1.
  const JULY = new Date("2026-07-01T12:00:00Z");
  // Saturday 19:00 is week slot 5 × 48 + 38.
  const SATURDAY_7PM = 278;

  it("moves New York Saturday 19:00 an hour earlier for Chicago", () => {
    assert.equal(
      moveWeekSlot(SATURDAY_7PM, "America/New_York", "America/Chicago", JULY),
      276,
    );
  });

  it("moves New York later for London, into Sunday only from 19:00", () => {
    // Saturday 18:30 is London's Saturday 23:30; 19:00 is Sunday 00:00.
    assert.equal(moveWeekSlot(277, "America/New_York", "Europe/London", JULY), 287);
    assert.equal(
      moveWeekSlot(SATURDAY_7PM, "America/New_York", "Europe/London", JULY),
      288,
    );
  });

  it("leaves a slot unchanged within one zone, a rounded zone too", () => {
    assert.equal(
      moveWeekSlot(SATURDAY_7PM, "America/New_York", "America/New_York", JULY),
      SATURDAY_7PM,
    );
    assert.equal(moveWeekSlot(100, "Asia/Kathmandu", "Asia/Kathmandu", JULY), 100);
  });

  it("wraps across Sunday into Monday and back", () => {
    // New York Sunday 22:00 (332) is London Monday 03:00 (6), and back.
    assert.equal(moveWeekSlot(332, "America/New_York", "Europe/London", JULY), 6);
    assert.equal(moveWeekSlot(6, "Europe/London", "America/New_York", JULY), 332);
  });

  it("lands where the grid paints the same half-hour", () => {
    const { grid } = computeOverlapGrid(
      [
        participant({
          userId: "a",
          timeZone: "Asia/Kathmandu",
          ranges: [range(5, 38, 39)],
        }),
      ],
      "America/New_York",
      JULY,
    );
    const moved = moveWeekSlot(SATURDAY_7PM, "Asia/Kathmandu", "America/New_York", JULY);
    assert.deepEqual(grid[Math.floor(moved / 48)][moved % 48].available, ["a"]);
  });
});
