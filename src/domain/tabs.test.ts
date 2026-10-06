import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickTab, tabRows } from "./tabs.ts";

describe("pickTab", () => {
  const ids = ["week", "answers", "invite"];

  it("returns a requested id that is a tab", () => {
    assert.equal(pickTab("answers", ids, "week"), "answers");
  });

  it("falls back when nothing is requested", () => {
    assert.equal(pickTab(undefined, ids, "invite"), "invite");
  });

  it("falls back when the requested id is not a tab", () => {
    assert.equal(pickTab("settings", ids, "week"), "week");
  });

  it("falls back when the request is an array", () => {
    assert.equal(pickTab(["answers", "invite"], ids, "week"), "week");
  });

  it("returns the first id when the fallback is not a tab either", () => {
    assert.equal(pickTab("settings", ids, "settings"), "week");
  });
});

describe("tabRows", () => {
  it("keeps three items in one row", () => {
    assert.deepEqual(tabRows([1, 2, 3]), [[1, 2, 3]]);
  });

  it("puts five items in a row of three and a row of two", () => {
    assert.deepEqual(tabRows([1, 2, 3, 4, 5]), [[1, 2, 3], [4, 5]]);
  });

  it("puts six items in two rows of three", () => {
    assert.deepEqual(tabRows([1, 2, 3, 4, 5, 6]), [
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });
});
