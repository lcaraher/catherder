import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAVE_FAILED, saveError, saved } from "./save-result.ts";

describe("save results", () => {
  it("reports a save as ok, a fresh object each time", () => {
    assert.deepEqual(saved(), { ok: true });
    assert.notEqual(saved(), saved());
  });

  it("names the field only when one is given", () => {
    assert.deepEqual(saveError("Add at least one option.", "options"), {
      ok: false,
      message: "Add at least one option.",
      field: "options",
    });
    assert.deepEqual(saveError(SAVE_FAILED), { ok: false, message: SAVE_FAILED });
    assert.equal(SAVE_FAILED, "That didn't save. Try again.");
  });
});
