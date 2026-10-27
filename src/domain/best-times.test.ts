import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findBestTimes,
  fitSharedTimes,
  hoursLabel,
  lengthLabel,
  missedLabel,
  sessionFit,
  sessionLabel,
  type BestTimesOptions,
} from "./best-times.ts";
import type { OverlapGrid } from "./overlap.ts";

// Grids are built by hand in the viewer's zone: grid[weekday][slot], 7 × 48.
function emptyGrid(): OverlapGrid {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 48 }, () => ({
      available: [] as string[],
      tentative: [] as string[],
    })),
  );
}

function paint(
  grid: OverlapGrid,
  userId: string,
  weekday: number,
  startSlot: number,
  endSlot: number,
  status: "AVAILABLE" | "TENTATIVE" = "AVAILABLE",
): void {
  for (let slot = startSlot; slot < endSlot; slot++) {
    const cell = grid[weekday][slot];
    (status === "AVAILABLE" ? cell.available : cell.tentative).push(userId);
  }
}

function options(overrides: Partial<BestTimesOptions>): BestTimesOptions {
  return {
    countedIds: ["a", "b", "c"],
    lengthSlots: 4,
    minPeople: 2,
    organizerId: null,
    nearlySlots: 0,
    ...overrides,
  };
}

const starts = (results: { start: number }[]) => results.map((r) => r.start);

describe("findBestTimes", () => {
  it("ranks the three-person start first once the session is short enough", () => {
    // Monday: a and b 18:00–21:00 (slots 36–42), c 18:00–20:30 (36–41).
    const grid = emptyGrid();
    paint(grid, "a", 0, 36, 42);
    paint(grid, "b", 0, 36, 42);
    paint(grid, "c", 0, 36, 41);

    const threeHours = findBestTimes(grid, options({ lengthSlots: 6 }));
    assert.deepEqual(threeHours, [
      { start: 36, can: ["a", "b"], maybe: [], nearly: [] },
    ]);

    const twoAndAHalf = findBestTimes(grid, options({ lengthSlots: 5 }));
    assert.deepEqual(twoAndAHalf, [
      { start: 36, can: ["a", "b", "c"], maybe: [], nearly: [] },
      { start: 37, can: ["a", "b"], maybe: [], nearly: [] },
    ]);
  });

  it("puts someone tentative in one half-hour under maybe", () => {
    const grid = emptyGrid();
    paint(grid, "a", 0, 36, 42);
    paint(grid, "b", 0, 36, 42);
    paint(grid, "c", 0, 36, 38);
    paint(grid, "c", 0, 38, 39, "TENTATIVE");
    paint(grid, "c", 0, 39, 42);

    const [best] = findBestTimes(grid, options({ lengthSlots: 6 }));
    assert.deepEqual(best, {
      start: 36,
      can: ["a", "b"],
      maybe: ["c"],
      nearly: [],
    });
  });

  it("lists one unpainted half-hour as nearly only when the window allows it", () => {
    // Tuesday 18:00–21:00; c leaves 19:30 (slot 39, week slot 87) unpainted.
    const grid = emptyGrid();
    paint(grid, "a", 1, 36, 42);
    paint(grid, "b", 1, 36, 42);
    paint(grid, "c", 1, 36, 39);
    paint(grid, "c", 1, 40, 42);
    const run = (nearlySlots: number) =>
      findBestTimes(grid, options({ lengthSlots: 6, nearlySlots }))[0];

    assert.deepEqual(run(0).nearly, []);
    assert.deepEqual(run(1).nearly, [{ userId: "c", missed: [87] }]);
    assert.deepEqual(run(2).nearly, [{ userId: "c", missed: [87] }]);
    assert.equal(run(1).start, 84);
  });

  it("never lists a gap as long as the session as nearly", () => {
    // a and b Monday 36–40; c paints slot 36 only.
    const grid = emptyGrid();
    paint(grid, "a", 0, 36, 40);
    paint(grid, "b", 0, 36, 40);
    paint(grid, "c", 0, 36, 37);

    const results = findBestTimes(
      grid,
      options({ lengthSlots: 2, nearlySlots: 4 }),
    );
    assert.deepEqual(
      results.map(({ start, nearly }) => ({ start, nearly })),
      [
        { start: 36, nearly: [{ userId: "c", missed: [37] }] },
        { start: 37, nearly: [] },
        { start: 38, nearly: [] },
      ],
    );
  });

  it("drops a two-person start when minPeople is 3", () => {
    const grid = emptyGrid();
    paint(grid, "a", 0, 36, 42);
    paint(grid, "b", 0, 36, 42);
    paint(grid, "c", 0, 36, 41);

    const results = findBestTimes(
      grid,
      options({ lengthSlots: 5, minPeople: 3 }),
    );
    assert.deepEqual(starts(results), [36]);
  });

  it("keeps only starts where the organizer is available throughout", () => {
    // a and b Monday 36–46; org 38–46, counted.
    const grid = emptyGrid();
    paint(grid, "a", 0, 36, 46);
    paint(grid, "b", 0, 36, 46);
    paint(grid, "org", 0, 38, 46);
    const counted = { countedIds: ["a", "b", "org"] };

    assert.deepEqual(
      starts(findBestTimes(grid, options({ ...counted, organizerId: null }))),
      [38, 39, 40, 41, 42, 36, 37],
    );
    assert.deepEqual(
      starts(findBestTimes(grid, options({ ...counted, organizerId: "org" }))),
      [38, 39, 40, 41, 42],
    );
  });

  it("drops a start where the organizer is tentative in one half-hour", () => {
    const grid = emptyGrid();
    paint(grid, "a", 0, 36, 46);
    paint(grid, "b", 0, 36, 46);
    paint(grid, "org", 0, 38, 40);
    paint(grid, "org", 0, 40, 41, "TENTATIVE");
    paint(grid, "org", 0, 41, 46);

    const results = findBestTimes(
      grid,
      options({ countedIds: ["a", "b", "org"], organizerId: "org" }),
    );
    assert.deepEqual(starts(results), [41, 42]);
  });

  it("filters by an organizer outside countedIds without counting them", () => {
    const grid = emptyGrid();
    paint(grid, "a", 0, 36, 44);
    paint(grid, "b", 0, 36, 44);
    paint(grid, "org", 0, 38, 42);

    const results = findBestTimes(
      grid,
      options({ countedIds: ["a", "b"], organizerId: "org", nearlySlots: 2 }),
    );
    assert.deepEqual(results, [
      { start: 38, can: ["a", "b"], maybe: [], nearly: [] },
    ]);
  });

  it("wraps a session from Sunday 23:30 into Monday 00:00", () => {
    // a and b Sunday 23:00 to Monday 01:00; c misses Monday 00:30 (slot 1).
    const grid = emptyGrid();
    for (const userId of ["a", "b"]) {
      paint(grid, userId, 6, 46, 48);
      paint(grid, userId, 0, 0, 2);
    }
    paint(grid, "c", 6, 46, 48);
    paint(grid, "c", 0, 0, 1);

    const results = findBestTimes(grid, options({ nearlySlots: 1 }));
    assert.deepEqual(results, [
      {
        start: 334,
        can: ["a", "b"],
        maybe: [],
        nearly: [{ userId: "c", missed: [1] }],
      },
    ]);
  });

  it("orders equal can counts by maybe count, then earliest start", () => {
    // a and b 05:00–06:00 Monday, Tuesday and Wednesday; c tentative Wednesday.
    const grid = emptyGrid();
    for (const weekday of [0, 1, 2]) {
      paint(grid, "a", weekday, 10, 12);
      paint(grid, "b", weekday, 10, 12);
    }
    paint(grid, "c", 2, 10, 12, "TENTATIVE");

    const results = findBestTimes(grid, options({ lengthSlots: 2 }));
    assert.deepEqual(starts(results), [106, 10, 58]);
  });

  it("returns [] for an empty grid", () => {
    assert.deepEqual(
      findBestTimes(emptyGrid(), options({ minPeople: 1, nearlySlots: 2 })),
      [],
    );
  });
});

describe("sessionFit", () => {
  it("returns empty lists for a start nobody fits", () => {
    const grid = emptyGrid();
    paint(grid, "a", 0, 36, 42);
    assert.deepEqual(sessionFit(grid, 100, options({ nearlySlots: 2 })), {
      start: 100,
      can: [],
      maybe: [],
      nearly: [],
    });
  });

  it("gives the same BestTime as findBestTimes for the same start", () => {
    // Tuesday 18:00–21:00; c tentative at 18:30, d misses 19:30 (week slot 87).
    const grid = emptyGrid();
    paint(grid, "a", 1, 36, 42);
    paint(grid, "b", 1, 36, 42);
    paint(grid, "c", 1, 36, 37);
    paint(grid, "c", 1, 37, 38, "TENTATIVE");
    paint(grid, "c", 1, 38, 42);
    paint(grid, "d", 1, 36, 39);
    paint(grid, "d", 1, 40, 42);
    const opts = options({
      countedIds: ["a", "b", "c", "d"],
      lengthSlots: 6,
      nearlySlots: 1,
    });

    const [best] = findBestTimes(grid, opts);
    assert.equal(best.start, 84);
    assert.deepEqual(sessionFit(grid, best.start, opts), best);
    assert.deepEqual(best, {
      start: 84,
      can: ["a", "b"],
      maybe: ["c"],
      nearly: [{ userId: "d", missed: [87] }],
    });
  });
});

describe("fitSharedTimes", () => {
  it("fits each start at its own length and ranks them as findBestTimes does", () => {
    // Monday: a and b 18:00–21:00; c 18:00–19:00 only.
    const grid = emptyGrid();
    paint(grid, "a", 0, 36, 42);
    paint(grid, "b", 0, 36, 42);
    paint(grid, "c", 0, 36, 38);
    paint(grid, "c", 0, 38, 40, "TENTATIVE");

    const fits = fitSharedTimes(
      grid,
      [
        { start: 36, lengthSlots: 6 },
        { start: 38, lengthSlots: 2 },
        { start: 36, lengthSlots: 2 },
      ],
      ["a", "b", "c"],
    );
    assert.deepEqual(fits, [
      { start: 36, lengthSlots: 2, can: ["a", "b", "c"], maybe: [], nearly: [] },
      { start: 38, lengthSlots: 2, can: ["a", "b"], maybe: ["c"], nearly: [] },
      { start: 36, lengthSlots: 6, can: ["a", "b"], maybe: [], nearly: [] },
    ]);
  });
});

describe("sessionLabel", () => {
  it("names the start's weekday and the span in 12-hour time", () => {
    // Saturday 19:00 is week slot 5 × 48 + 38.
    assert.equal(sessionLabel(278, 6, "TWELVE_HOUR"), "Saturday 7:00 PM–10:00 PM");
  });

  it("names the start's weekday and the span in 24-hour time", () => {
    assert.equal(sessionLabel(278, 6, "TWENTY_FOUR_HOUR"), "Saturday 19:00–22:00");
  });

  it("names only the start's day for a session crossing midnight", () => {
    // Sunday 22:00 for 3 hours ends Monday 01:00.
    assert.equal(sessionLabel(332, 6, "TWELVE_HOUR"), "Sunday 10:00 PM–1:00 AM");
    assert.equal(sessionLabel(332, 6, "TWENTY_FOUR_HOUR"), "Sunday 22:00–01:00");
  });

  it("ends a session at midnight as the format reads midnight", () => {
    assert.equal(sessionLabel(42, 6, "TWELVE_HOUR"), "Monday 9:00 PM–12:00 AM");
    assert.equal(sessionLabel(42, 6, "TWENTY_FOUR_HOUR"), "Monday 21:00–24:00");
  });
});

describe("missedLabel", () => {
  it("prints one missed half-hour as its span", () => {
    assert.equal(missedLabel([38], "TWELVE_HOUR"), "7:00 PM–7:30 PM");
    assert.equal(missedLabel([38], "TWENTY_FOUR_HOUR"), "19:00–19:30");
  });

  it("joins separate spans with \" and \"", () => {
    assert.equal(
      missedLabel([38, 42], "TWELVE_HOUR"),
      "7:00 PM–7:30 PM and 9:00 PM–9:30 PM",
    );
    assert.equal(missedLabel([38, 42], "TWENTY_FOUR_HOUR"), "19:00–19:30 and 21:00–21:30");
  });

  it("merges consecutive half-hours into one span", () => {
    assert.equal(missedLabel([86, 87, 90], "TWELVE_HOUR"), "7:00 PM–8:00 PM and 9:00 PM–9:30 PM");
  });

  it("merges a span crossing midnight, Sunday into Monday too", () => {
    assert.equal(missedLabel([46, 47, 48], "TWELVE_HOUR"), "11:00 PM–12:30 AM");
    assert.equal(missedLabel([335, 0], "TWENTY_FOUR_HOUR"), "23:30–00:30");
  });
});

describe("lengthLabel", () => {
  it("reads half-hours as the banner's criteria", () => {
    assert.equal(lengthLabel(1), "30-minute");
    assert.equal(lengthLabel(2), "1-hour");
    assert.equal(lengthLabel(5), "2.5-hour");
    assert.equal(lengthLabel(6), "3-hour");
  });
});

describe("hoursLabel", () => {
  it("reads half-hours as the select's options", () => {
    assert.equal(hoursLabel(1), "30 minutes");
    assert.equal(hoursLabel(2), "1 hour");
    assert.equal(hoursLabel(3), "1.5 hours");
    assert.equal(hoursLabel(5), "2.5 hours");
    assert.equal(hoursLabel(8), "4 hours");
  });
});
