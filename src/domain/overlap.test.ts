import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AvailabilityRange } from "./availability.ts";
import {
  collapseOverlapToHours,
  computeOverlapGrid,
  splitGm,
  type OverlapParticipant,
} from "./overlap.ts";

// A fixed "now" so the reference week is deterministic. The test zones are
// all fixed-offset (Etc/*, Asia/*), so DST cannot shift results either way.
const NOW = new Date("2026-09-13T12:00:00Z");

function participant(
  overrides: Partial<OverlapParticipant> & { userId: string },
): OverlapParticipant {
  return {
    displayName: overrides.userId,
    isGameMaster: false,
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
    // Asia/Kathmandu is UTC+5:45, exactly between +5:30 and +6:00; the tie
    // rounds away from zero, so it is treated as +6:00: their Monday 12:00
    // (slot 24) lands at the viewer's 06:00 (slot 12).
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

describe("splitGm", () => {
  it("removes the GM from the counts and reports them separately", () => {
    const { grid } = computeOverlapGrid(
      [
        participant({ userId: "gm", ranges: [range(0, 36, 37), range(0, 37, 38, "TENTATIVE")] }),
        participant({ userId: "a", ranges: [range(0, 36, 38)] }),
      ],
      "UTC",
      NOW,
    );
    const split = splitGm(grid, "gm");
    assert.deepEqual(split[0][36], {
      players: { available: ["a"], tentative: [] },
      gm: "AVAILABLE",
    });
    assert.deepEqual(split[0][37], {
      players: { available: ["a"], tentative: [] },
      gm: "TENTATIVE",
    });
    // A cell the GM is not painted in reports gm null.
    assert.deepEqual(split[0][35], {
      players: { available: [], tentative: [] },
      gm: null,
    });
  });

  it("with gmUserId null, players equal the input cells and gm is null", () => {
    const { grid } = computeOverlapGrid(
      [
        participant({ userId: "a", ranges: [range(3, 20, 22)] }),
        participant({ userId: "b", ranges: [range(3, 20, 22, "TENTATIVE")] }),
      ],
      "UTC",
      NOW,
    );
    const split = splitGm(grid, null);
    for (let weekday = 0; weekday < grid.length; weekday++) {
      for (let slot = 0; slot < grid[weekday].length; slot++) {
        assert.deepEqual(split[weekday][slot].players, grid[weekday][slot]);
        assert.equal(split[weekday][slot].gm, null);
      }
    }
  });

  it("does not mutate the input grid", () => {
    const { grid } = computeOverlapGrid(
      [participant({ userId: "gm", ranges: [range(0, 36, 38)] })],
      "UTC",
      NOW,
    );
    splitGm(grid, "gm");
    assert.deepEqual(grid[0][36], { available: ["gm"], tentative: [] });
  });
});

describe("collapseOverlapToHours", () => {
  it("applies the hour-collapse rule per participant", () => {
    // In 18:00–19:00 (slots 36 and 37):
    //   a — AVAILABLE in both halves            -> available
    //   b — AVAILABLE in the first half only    -> excluded
    //   c — AVAILABLE then TENTATIVE            -> tentative
    //   d — TENTATIVE in both halves            -> tentative
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

  it("applies the same both-halves rule to the GM on a split grid", () => {
    // GM: 18:00–19:00 both halves AVAILABLE; 19:00–20:00 AVAILABLE then
    // TENTATIVE; 20:00–21:00 first half only. Player a spans 18:00–21:00.
    const { grid } = computeOverlapGrid(
      [
        participant({
          userId: "gm",
          ranges: [range(0, 36, 39), range(0, 39, 40, "TENTATIVE"), range(0, 40, 41)],
        }),
        participant({ userId: "a", ranges: [range(0, 36, 42)] }),
      ],
      "UTC",
      NOW,
    );
    const hours = collapseOverlapToHours(splitGm(grid, "gm"));
    assert.equal(hours[0].length, 24);
    assert.deepEqual(hours[0][18], {
      players: { available: ["a"], tentative: [] },
      gm: "AVAILABLE",
    });
    assert.deepEqual(hours[0][19], {
      players: { available: ["a"], tentative: [] },
      gm: "TENTATIVE",
    });
    // One painted half-hour out of two: the GM does not count for the hour.
    assert.deepEqual(hours[0][20], {
      players: { available: ["a"], tentative: [] },
      gm: null,
    });
  });
});
