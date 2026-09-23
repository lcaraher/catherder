import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { statusLabel } from "./status-label.ts";

describe("statusLabel", () => {
  const known: [string, string][] = [
    ["SUBMITTED", "Submitted"],
    ["INVITED", "Invited"],
    ["DRAFT", "Draft"],
    ["OPEN", "Open"],
    ["CLOSED", "Closed"],
    ["ARCHIVED", "Archived"],
  ];
  for (const [value, label] of known) {
    it(`renders ${value} as "${label}"`, () => {
      assert.equal(statusLabel(value), label);
    });
  }

  it("sentence-cases an unknown value", () => {
    assert.equal(statusLabel("PENDING"), "Pending");
  });

  it("leaves an empty string empty", () => {
    assert.equal(statusLabel(""), "");
  });
});
