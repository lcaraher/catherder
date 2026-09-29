import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FOOTER_LINES, pickFooterLine } from "./footer-lines.ts";

describe("pickFooterLine", () => {
  it("returns one of FOOTER_LINES for random values across [0, 1)", () => {
    for (const value of [0, 0.1, 0.25, 0.5, 0.75, 0.999999, 1 - Number.EPSILON]) {
      assert.ok(FOOTER_LINES.includes(pickFooterLine(() => value)));
    }
  });

  it("returns one of FOOTER_LINES with the default random source", () => {
    for (let i = 0; i < 200; i += 1) {
      assert.ok(FOOTER_LINES.includes(pickFooterLine()));
    }
  });

  it("reaches every line", () => {
    const seen = new Set(
      FOOTER_LINES.map((_, i) => pickFooterLine(() => i / FOOTER_LINES.length)),
    );
    assert.equal(seen.size, FOOTER_LINES.length);
  });
});
