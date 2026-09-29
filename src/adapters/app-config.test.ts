import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { appUrl, buildLabel, resetAppConfigForTests } from "./app-config.ts";

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

describe("buildLabel", () => {
  function withEnv(baseUrl: string | undefined, commit: string | undefined): void {
    if (baseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = baseUrl;
    if (commit === undefined) delete process.env.APP_COMMIT;
    else process.env.APP_COMMIT = commit;
  }

  afterEach(() => {
    delete process.env.APP_BASE_URL;
    delete process.env.APP_COMMIT;
  });

  it("is local when APP_BASE_URL is unset", () => {
    withEnv(undefined, undefined);
    assert.equal(buildLabel(), "local");
  });

  it("is local on localhost", () => {
    withEnv("http://localhost:3001", undefined);
    assert.equal(buildLabel(), "local");
  });

  it("adds the commit to local when APP_COMMIT is set", () => {
    withEnv("http://localhost:3001", "abc1234");
    assert.equal(buildLabel(), "local · abc1234");
  });

  it("does not throw on an unparseable APP_BASE_URL", () => {
    withEnv("not a url", undefined);
    assert.equal(buildLabel(), "local");
  });

  it("is the host's first label on a deployed site", () => {
    withEnv("https://dev.catherderapp.com", undefined);
    assert.equal(buildLabel(), "dev");
  });

  it("adds the commit to the first label", () => {
    withEnv("https://dev.catherderapp.com", "abc1234");
    assert.equal(buildLabel(), "dev · abc1234");
  });

  it("is just the commit on the app host", () => {
    withEnv("https://app.catherderapp.com", "abc1234");
    assert.equal(buildLabel(), "abc1234");
  });

  it("is empty on the app host without a commit", () => {
    withEnv("https://app.catherderapp.com", undefined);
    assert.equal(buildLabel(), "");
  });
});
