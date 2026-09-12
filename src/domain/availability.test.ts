import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cellsToRanges,
  dbTimeToHour,
  hourToDbTime,
  isValidIanaTimeZone,
  rangesToCells,
  validateRanges,
} from "./availability.ts";

describe("cellsToRanges", () => {
  it("returns an empty list for no cells", () => {
    assert.deepEqual(cellsToRanges([]), []);
  });

  it("merges adjacent hours into one range", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 0, hour: 9 },
        { weekday: 0, hour: 10 },
        { weekday: 0, hour: 11 },
      ]),
      [{ weekday: 0, startHour: 9, endHour: 12 }],
    );
  });

  it("splits non-adjacent hours into separate ranges", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 2, hour: 8 },
        { weekday: 2, hour: 12 },
        { weekday: 2, hour: 13 },
      ]),
      [
        { weekday: 2, startHour: 8, endHour: 9 },
        { weekday: 2, startHour: 12, endHour: 14 },
      ],
    );
  });

  it("keeps weekdays separate even for the same hours", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 1, hour: 9 },
        { weekday: 3, hour: 9 },
      ]),
      [
        { weekday: 1, startHour: 9, endHour: 10 },
        { weekday: 3, startHour: 9, endHour: 10 },
      ],
    );
  });

  it("tolerates duplicate and unsorted input", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 5, hour: 21 },
        { weekday: 5, hour: 20 },
        { weekday: 5, hour: 21 },
      ]),
      [{ weekday: 5, startHour: 20, endHour: 22 }],
    );
  });

  it("merges up to midnight as an exclusive endHour of 24", () => {
    assert.deepEqual(
      cellsToRanges([
        { weekday: 6, hour: 22 },
        { weekday: 6, hour: 23 },
      ]),
      [{ weekday: 6, startHour: 22, endHour: 24 }],
    );
  });
});

describe("rangesToCells", () => {
  it("expands a range into its hour cells", () => {
    assert.deepEqual(rangesToCells([{ weekday: 4, startHour: 6, endHour: 9 }]), [
      { weekday: 4, hour: 6 },
      { weekday: 4, hour: 7 },
      { weekday: 4, hour: 8 },
    ]);
  });

  it("round-trips with cellsToRanges", () => {
    const ranges = [
      { weekday: 0, startHour: 9, endHour: 12 },
      { weekday: 0, startHour: 18, endHour: 24 },
      { weekday: 6, startHour: 0, endHour: 2 },
    ];
    assert.deepEqual(cellsToRanges(rangesToCells(ranges)), ranges);
  });
});

describe("validateRanges", () => {
  it("accepts valid ranges", () => {
    const input = [
      { weekday: 0, startHour: 9, endHour: 12 },
      { weekday: 6, startHour: 22, endHour: 24 },
    ];
    assert.deepEqual(validateRanges(input), input);
  });

  it("accepts touching (non-overlapping) ranges", () => {
    assert.doesNotThrow(() =>
      validateRanges([
        { weekday: 1, startHour: 9, endHour: 10 },
        { weekday: 1, startHour: 10, endHour: 11 },
      ]),
    );
  });

  it("rejects non-arrays", () => {
    assert.throws(() => validateRanges({}), /must be an array/);
    assert.throws(() => validateRanges("nope"), /must be an array/);
  });

  it("rejects out-of-range weekdays", () => {
    assert.throws(
      () => validateRanges([{ weekday: 7, startHour: 1, endHour: 2 }]),
      /weekday/,
    );
    assert.throws(
      () => validateRanges([{ weekday: -1, startHour: 1, endHour: 2 }]),
      /weekday/,
    );
  });

  it("rejects non-integer and out-of-range hours", () => {
    assert.throws(
      () => validateRanges([{ weekday: 0, startHour: 1.5, endHour: 3 }]),
      /hours/,
    );
    assert.throws(
      () => validateRanges([{ weekday: 0, startHour: 1, endHour: 25 }]),
      /hours/,
    );
  });

  it("rejects empty or inverted ranges", () => {
    assert.throws(
      () => validateRanges([{ weekday: 0, startHour: 5, endHour: 5 }]),
      /hours/,
    );
    assert.throws(
      () => validateRanges([{ weekday: 0, startHour: 6, endHour: 5 }]),
      /hours/,
    );
  });

  it("rejects overlapping ranges on the same weekday", () => {
    assert.throws(
      () =>
        validateRanges([
          { weekday: 2, startHour: 9, endHour: 12 },
          { weekday: 2, startHour: 11, endHour: 13 },
        ]),
      /overlap/,
    );
  });

  it("allows the same hours on different weekdays", () => {
    assert.doesNotThrow(() =>
      validateRanges([
        { weekday: 2, startHour: 9, endHour: 12 },
        { weekday: 3, startHour: 9, endHour: 12 },
      ]),
    );
  });
});

describe("db TIME mapping", () => {
  it("stores whole hours as their wall-clock time", () => {
    assert.equal(hourToDbTime(9).getUTCHours(), 9);
    assert.equal(hourToDbTime(0).getUTCHours(), 0);
  });

  it("stores midnight-at-end (24) as 00:00", () => {
    assert.equal(hourToDbTime(24).getUTCHours(), 0);
  });

  it("reads 00:00 back as 0 for starts and 24 for ends", () => {
    assert.equal(dbTimeToHour(hourToDbTime(0), "start"), 0);
    assert.equal(dbTimeToHour(hourToDbTime(24), "end"), 24);
  });

  it("round-trips every paintable boundary", () => {
    for (let hour = 0; hour < 24; hour++) {
      assert.equal(dbTimeToHour(hourToDbTime(hour), "start"), hour);
    }
    for (let hour = 1; hour <= 24; hour++) {
      assert.equal(dbTimeToHour(hourToDbTime(hour), "end"), hour);
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
