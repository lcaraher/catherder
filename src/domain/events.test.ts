import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { descriptionCounterVisible, hasDescription } from "./events.ts";

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

describe("hasDescription", () => {
  it("is false for no description", () => {
    assert.equal(hasDescription(null), false);
  });

  it("is false for a blank description", () => {
    assert.equal(hasDescription(" \n "), false);
  });

  it("is false for Markdown that shows nothing, like an empty heading", () => {
    assert.equal(hasDescription("##"), false);
  });

  it("is true for a description with text", () => {
    assert.equal(hasDescription("Bring dice."), true);
  });
});
