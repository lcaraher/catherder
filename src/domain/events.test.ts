import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { descriptionCounterVisible } from "./events.ts";

describe("descriptionCounterVisible", () => {
  it("hides the counter for an empty description", () => {
    assert.equal(descriptionCounterVisible(0), false);
  });

  it("hides the counter one character below the threshold", () => {
    assert.equal(descriptionCounterVisible(8999), false);
  });

  it("shows the counter at the threshold", () => {
    assert.equal(descriptionCounterVisible(9000), true);
  });

  it("shows the counter past the cap", () => {
    assert.equal(descriptionCounterVisible(10001), true);
  });
});
