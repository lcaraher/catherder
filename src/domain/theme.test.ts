import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_THEME, THEMES, isTheme, resolveTheme } from "./theme.ts";

describe("isTheme", () => {
  for (const theme of THEMES) {
    it(`accepts "${theme}"`, () => {
      assert.equal(isTheme(theme), true);
    });
  }

  const rejected: [string, unknown][] = [
    ['"dark"', "dark"],
    ["an empty string", ""],
    ['"auto"', "auto"],
    ['upper-case "CHILLPILL"', "CHILLPILL"],
    ["undefined", undefined],
    ["a number", 1],
  ];
  for (const [description, value] of rejected) {
    it(`rejects ${description}`, () => {
      assert.equal(isTheme(value), false);
    });
  }
});

describe("resolveTheme", () => {
  for (const theme of THEMES) {
    it(`returns "${theme}" unchanged`, () => {
      assert.equal(resolveTheme(theme), theme);
    });
  }

  for (const value of ["dark", "", "auto", "CHILLPILL", undefined]) {
    it(`returns the default for ${JSON.stringify(value)}`, () => {
      assert.equal(resolveTheme(value), DEFAULT_THEME);
    });
  }
});
