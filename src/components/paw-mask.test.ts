import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAW_MASK } from "./paw-mask.ts";

describe("PAW_MASK", () => {
  it("has 24 rows of 28 characters", () => {
    assert.equal(PAW_MASK.length, 24);
    for (const row of PAW_MASK) assert.equal(row.length, 28);
  });

  it("uses only t, p, L and .", () => {
    for (const row of PAW_MASK) assert.match(row, /^[tpL.]+$/);
  });
});
