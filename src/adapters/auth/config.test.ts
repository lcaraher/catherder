import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSiteAdminUsernames } from "./config.ts";

describe("parseSiteAdminUsernames", () => {
  it("is undefined when the variable is unset", () => {
    assert.equal(parseSiteAdminUsernames(undefined), undefined);
  });

  it("is undefined when the variable is blank or only separators", () => {
    assert.equal(parseSiteAdminUsernames(""), undefined);
    assert.equal(parseSiteAdminUsernames("   "), undefined);
    assert.equal(parseSiteAdminUsernames(" , ,"), undefined);
  });

  it("returns a single name", () => {
    assert.deepEqual(parseSiteAdminUsernames("greta"), ["greta"]);
  });

  it("trims two names separated with spaces and drops empty entries", () => {
    assert.deepEqual(parseSiteAdminUsernames(" greta , pat ,"), [
      "greta",
      "pat",
    ]);
  });

  it("lower-cases names so the comparison ignores case", () => {
    assert.deepEqual(parseSiteAdminUsernames("Greta,PAT"), ["greta", "pat"]);
  });
});
