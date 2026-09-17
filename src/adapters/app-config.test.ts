import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { appUrl, resetAppConfigForTests } from "./app-config.ts";

function withBaseUrl(value: string): void {
  process.env.APP_BASE_URL = value;
  resetAppConfigForTests();
}

describe("appUrl", () => {
  afterEach(() => {
    delete process.env.APP_BASE_URL;
    resetAppConfigForTests();
  });

  it("resolves / against the public origin", () => {
    withBaseUrl("https://example.test");
    assert.equal(appUrl("/").href, "https://example.test/");
  });

  it("keeps the given path", () => {
    withBaseUrl("https://example.test");
    assert.equal(appUrl("/e/abc/respond").href, "https://example.test/e/abc/respond");
  });

  it("uses only the origin when APP_BASE_URL has a path or trailing slash", () => {
    withBaseUrl("https://example.test/some/base/");
    assert.equal(appUrl("/").href, "https://example.test/");
    assert.equal(appUrl("/e/abc").href, "https://example.test/e/abc");
    withBaseUrl("https://example.test:9443/");
    assert.equal(appUrl("/").href, "https://example.test:9443/");
  });

  it("re-reads the environment after a reset", () => {
    withBaseUrl("https://one.test");
    assert.equal(appUrl("/").origin, "https://one.test");
    withBaseUrl("https://two.test");
    assert.equal(appUrl("/").origin, "https://two.test");
  });
});
