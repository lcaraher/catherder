import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cellsToRanges,
  collapseHourCell,
  cycleStatus,
  dbTimeToSlot,
  isValidIanaTimeZone,
  rangesToCells,
  slotLabel,
  slotToDbTime,
  validateRanges,
} from "./availability.ts";

describe("cellsToRanges", () => {
  it("returns an empty list for no cells", () => {
    assert.deepEqual(cellsToRanges([]), []);
  });

  it("merges contiguous same-status slots into one range", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 0, slot: 18, status: "AVAILABLE" },
        { weekday: 0, slot: 19, status: "AVAILABLE" },
        { weekday: 0, slot: 20, status: "AVAILABLE" },
      ]),
      [{ weekday: 0, startSlot: 18, endSlot: 21, status: "AVAILABLE" }],
    );
  });

  it("does not merge adjacent slots with different statuses", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 1, slot: 20, status: "AVAILABLE" },
        { weekday: 1, slot: 21, status: "AVAILABLE" },
        { weekday: 1, slot: 22, status: "TENTATIVE" },
        { weekday: 1, slot: 23, status: "TENTATIVE" },
      ]),
      [
        { weekday: 1, startSlot: 20, endSlot: 22, status: "AVAILABLE" },
        { weekday: 1, startSlot: 22, endSlot: 24, status: "TENTATIVE" },
      ],
    );
  });

  it("splits non-adjacent slots into separate ranges", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 2, slot: 16, status: "AVAILABLE" },
        { weekday: 2, slot: 24, status: "AVAILABLE" },
        { weekday: 2, slot: 25, status: "AVAILABLE" },
      ]),
      [
        { weekday: 2, startSlot: 16, endSlot: 17, status: "AVAILABLE" },
        { weekday: 2, startSlot: 24, endSlot: 26, status: "AVAILABLE" },
      ],
    );
  });

  it("keeps weekdays separate even for the same slots", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 1, slot: 18, status: "TENTATIVE" },
        { weekday: 3, slot: 18, status: "TENTATIVE" },
      ]),
      [
        { weekday: 1, startSlot: 18, endSlot: 19, status: "TENTATIVE" },
        { weekday: 3, startSlot: 18, endSlot: 19, status: "TENTATIVE" },
      ],
    );
  });

  it("tolerates unsorted input and lets the last duplicate win", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 5, slot: 41, status: "AVAILABLE" },
        { weekday: 5, slot: 40, status: "AVAILABLE" },
        { weekday: 5, slot: 41, status: "AVAILABLE" },
      ]),
      [{ weekday: 5, startSlot: 40, endSlot: 42, status: "AVAILABLE" }],
    );
  });

  it("merges up to midnight as an exclusive endSlot of 48", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 6, slot: 46, status: "AVAILABLE" },
        { weekday: 6, slot: 47, status: "AVAILABLE" },
      ]),
      [{ weekday: 6, startSlot: 46, endSlot: 48, status: "AVAILABLE" }],
    );
  });
});

describe("rangesToCells", () => {
  it("expands a range into its slot cells with status", () => {
    assert.deepEqual(
      rangesToCells([
        { weekday: 4, startSlot: 13, endSlot: 16, status: "TENTATIVE" },
      ]),
      [
        { weekday: 4, slot: 13, status: "TENTATIVE" },
        { weekday: 4, slot: 14, status: "TENTATIVE" },
        { weekday: 4, slot: 15, status: "TENTATIVE" },
      ],
    );
  });

  it("round-trips with cellsToRanges, preserving status boundaries", () => {
    const ranges: ReturnType<typeof cellsToRanges> = [
      { weekday: 0, startSlot: 18, endSlot: 24, status: "AVAILABLE" },
      { weekday: 0, startSlot: 24, endSlot: 27, status: "TENTATIVE" },
      { weekday: 6, startSlot: 44, endSlot: 48, status: "AVAILABLE" },
    ];
    assert.deepEqual(cellsToRanges(rangesToCells(ranges)), ranges);
  });
});

describe("validateRanges", () => {
  it("accepts valid ranges with both statuses", () => {
    const input = [
      { weekday: 0, startSlot: 18, endSlot: 24, status: "AVAILABLE" },
      { weekday: 6, startSlot: 44, endSlot: 48, status: "TENTATIVE" },
    ];
    assert.deepEqual(validateRanges(input), input);
  });

  it("accepts touching ranges of different statuses", () => {
    assert.doesNotThrow(() =>
      validateRanges([
        { weekday: 1, startSlot: 18, endSlot: 20, status: "AVAILABLE" },
        { weekday: 1, startSlot: 20, endSlot: 22, status: "TENTATIVE" },
      ]),
    );
  });

  it("rejects non-arrays", () => {
    assert.throws(() => validateRanges({}), /must be an array/);
    assert.throws(() => validateRanges("nope"), /must be an array/);
  });

  it("rejects out-of-range weekdays", () => {
    assert.throws(
      () =>
        validateRanges([
          { weekday: 7, startSlot: 1, endSlot: 2, status: "AVAILABLE" },
        ]),
      /weekday/,
    );
  });

  it("rejects non-integer and out-of-range slots", () => {
    assert.throws(
      () =>
        validateRanges([
          { weekday: 0, startSlot: 1.5, endSlot: 3, status: "AVAILABLE" },
        ]),
      /slots/,
    );
    assert.throws(
      () =>
        validateRanges([
          { weekday: 0, startSlot: 1, endSlot: 49, status: "AVAILABLE" },
        ]),
      /slots/,
    );
  });

  it("rejects empty or inverted ranges", () => {
    assert.throws(
      () =>
        validateRanges([
          { weekday: 0, startSlot: 5, endSlot: 5, status: "AVAILABLE" },
        ]),
      /slots/,
    );
    assert.throws(
      () =>
        validateRanges([
          { weekday: 0, startSlot: 6, endSlot: 5, status: "AVAILABLE" },
        ]),
      /slots/,
    );
  });

  it("rejects unknown statuses", () => {
    assert.throws(
      () =>
        validateRanges([
          { weekday: 0, startSlot: 1, endSlot: 2, status: "MAYBE" },
        ]),
      /status/,
    );
    assert.throws(
      () => validateRanges([{ weekday: 0, startSlot: 1, endSlot: 2 }]),
      /status/,
    );
  });

  it("rejects overlaps within a weekday regardless of status", () => {
    assert.throws(
      () =>
        validateRanges([
          { weekday: 2, startSlot: 18, endSlot: 24, status: "AVAILABLE" },
          { weekday: 2, startSlot: 22, endSlot: 26, status: "TENTATIVE" },
        ]),
      /overlap/,
    );
    assert.throws(
      () =>
        validateRanges([
          { weekday: 2, startSlot: 18, endSlot: 24, status: "AVAILABLE" },
          { weekday: 2, startSlot: 20, endSlot: 22, status: "AVAILABLE" },
        ]),
      /overlap/,
    );
  });

  it("allows the same slots on different weekdays", () => {
    assert.doesNotThrow(() =>
      validateRanges([
        { weekday: 2, startSlot: 18, endSlot: 24, status: "AVAILABLE" },
        { weekday: 3, startSlot: 18, endSlot: 24, status: "TENTATIVE" },
      ]),
    );
  });
});

describe("cycleStatus", () => {
  it("cycles empty -> available -> tentative -> empty", () => {
    assert.equal(cycleStatus(null), "AVAILABLE");
    assert.equal(cycleStatus("AVAILABLE"), "TENTATIVE");
    assert.equal(cycleStatus("TENTATIVE"), null);
  });
});

describe("collapseHourCell (hour-mode collapse rule)", () => {
  it("collapses agreeing halves to their shared state", () => {
    assert.equal(collapseHourCell("AVAILABLE", "AVAILABLE"), "AVAILABLE");
    assert.equal(collapseHourCell("TENTATIVE", "TENTATIVE"), "TENTATIVE");
    assert.equal(collapseHourCell(null, null), null);
  });

  it("reports disagreeing halves as MIXED", () => {
    assert.equal(collapseHourCell("AVAILABLE", "TENTATIVE"), "MIXED");
    assert.equal(collapseHourCell(null, "AVAILABLE"), "MIXED");
    assert.equal(collapseHourCell("TENTATIVE", null), "MIXED");
  });

  it("treats a mixed cell as empty, so the next click makes both available", () => {
    const collapsed = collapseHourCell("AVAILABLE", "TENTATIVE");
    const next = cycleStatus(collapsed === "MIXED" ? null : collapsed);
    assert.equal(next, "AVAILABLE");
  });
});

describe("slotLabel", () => {
  it("labels half-hour boundaries", () => {
    assert.equal(slotLabel(0), "00:00");
    assert.equal(slotLabel(19), "09:30");
    assert.equal(slotLabel(47), "23:30");
    assert.equal(slotLabel(48), "24:00");
  });
});

describe("db TIME mapping", () => {
  it("stores slots at half-hour boundaries", () => {
    assert.equal(slotToDbTime(18).getUTCHours(), 9);
    assert.equal(slotToDbTime(18).getUTCMinutes(), 0);
    assert.equal(slotToDbTime(19).getUTCHours(), 9);
    assert.equal(slotToDbTime(19).getUTCMinutes(), 30);
  });

  it("stores midnight-at-end (slot 48) as 00:00", () => {
    assert.equal(slotToDbTime(48).getUTCHours(), 0);
    assert.equal(slotToDbTime(48).getUTCMinutes(), 0);
  });

  it("reads 00:00 back as 0 for starts and 48 for ends", () => {
    assert.equal(dbTimeToSlot(slotToDbTime(0), "start"), 0);
    assert.equal(dbTimeToSlot(slotToDbTime(48), "end"), 48);
  });

  it("round-trips every paintable boundary", () => {
    for (let slot = 0; slot < 48; slot++) {
      assert.equal(dbTimeToSlot(slotToDbTime(slot), "start"), slot);
    }
    for (let slot = 1; slot <= 48; slot++) {
      assert.equal(dbTimeToSlot(slotToDbTime(slot), "end"), slot);
    }
  });
});

describe("isValidIanaTimeZone", () => {
  it("accepts real zone names", () => {
    assert.equal(isValidIanaTimeZone("America/New_York"), true);
    assert.equal(isValidIanaTimeZone("UTC"), true);
  });

  it("rejects unknown names and non-strings", () => {
    assert.equal(isValidIanaTimeZone("Not/A_Zone"), false);
    assert.equal(isValidIanaTimeZone(""), false);
    assert.equal(isValidIanaTimeZone(5), false);
    assert.equal(isValidIanaTimeZone(null), false);
  });
});
