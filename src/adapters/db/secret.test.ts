import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCredentialSource,
  parseSecretString,
  type CredentialFetcher,
} from "./secret.ts";

const ARN = "arn:aws:secretsmanager:us-east-2:1:secret:x";

// Fake fetcher that hands out a new password on every call and counts calls.
function fakeFetcher(): { fetcher: CredentialFetcher; calls: () => number } {
  let n = 0;
  return {
    fetcher: async (arn) => {
      assert.equal(arn, ARN);
      n += 1;
      return { username: "catherder_admin", password: `p${n}` };
    },
    calls: () => n,
  };
}

describe("parseSecretString", () => {
  it("reads username and password from the RDS JSON", () => {
    assert.deepEqual(
      parseSecretString(
        '{"username":"catherder_admin","password":"s3cret","engine":"postgres"}',
      ),
      { username: "catherder_admin", password: "s3cret" },
    );
  });

  it("rejects non-JSON and incomplete secrets", () => {
    assert.throws(() => parseSecretString("not json"), /not JSON/);
    assert.throws(() => parseSecretString('{"username":"u"}'), /missing/);
    assert.throws(() => parseSecretString('{"username":"","password":"p"}'), /missing/);
    assert.throws(() => parseSecretString("[]"), /missing/);
  });
});

describe("createCredentialSource", () => {
  it("fetches once and serves the cached value until invalidated", async () => {
    const { fetcher, calls } = fakeFetcher();
    const source = createCredentialSource(ARN, fetcher);
    assert.equal((await source.get()).password, "p1");
    assert.equal((await source.get()).password, "p1");
    assert.equal(calls(), 1);

    source.invalidate();
    assert.equal((await source.get()).password, "p2");
    assert.equal(calls(), 2);
  });

  it("shares one in-flight fetch between concurrent callers", async () => {
    const { fetcher, calls } = fakeFetcher();
    const source = createCredentialSource(ARN, fetcher);
    const [a, b] = await Promise.all([source.get(), source.get()]);
    assert.equal(a.password, "p1");
    assert.equal(b.password, "p1");
    assert.equal(calls(), 1);
  });

  it("refetches after the cache period", async () => {
    let clock = 0;
    const { fetcher, calls } = fakeFetcher();
    const source = createCredentialSource(ARN, fetcher, {
      ttlMs: 1000,
      now: () => clock,
    });
    assert.equal((await source.get()).password, "p1");
    clock = 999;
    assert.equal((await source.get()).password, "p1");
    clock = 1000;
    assert.equal((await source.get()).password, "p2");
    assert.equal(calls(), 2);
  });

  it("does not cache a failed fetch", async () => {
    let fail = true;
    const source = createCredentialSource(ARN, async () => {
      if (fail) throw new Error("throttled");
      return { username: "u", password: "ok" };
    });
    await assert.rejects(source.get(), /throttled/);
    fail = false;
    assert.equal((await source.get()).password, "ok");
  });
});
