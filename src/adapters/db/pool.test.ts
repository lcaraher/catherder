import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import {
  isInvalidPasswordError,
  passwordProvider,
  attachCredentialSource,
  type CredentialPool,
} from "./pool.ts";
import { createCredentialSource, type CredentialSource } from "./secret.ts";

const ARN = "arn:aws:secretsmanager:us-east-2:1:secret:x";

function rotatingSource(): { source: CredentialSource; calls: () => number } {
  let n = 0;
  const source = createCredentialSource(ARN, async () => {
    n += 1;
    return { username: `user${n}`, password: `p${n}` };
  });
  return { source, calls: () => n };
}

// Minimal stand-in for a pg Pool whose connect outcome the test controls.
function fakePool(outcome: () => Error | null): CredentialPool & {
  attempts: number;
} {
  const client = {} as PoolClient;
  const pool = {
    options: {} as { user?: string },
    attempts: 0,
    connect(cb?: Parameters<CredentialPool["connect"]>[0]) {
      pool.attempts += 1;
      const error = outcome();
      if (cb) {
        cb(error ?? undefined, error ? undefined : client, () => undefined);
        return;
      }
      return error ? Promise.reject(error) : Promise.resolve(client);
    },
  };
  return pool as unknown as CredentialPool & { attempts: number };
}

function invalidPassword(): Error {
  return Object.assign(new Error("password authentication failed"), {
    code: "28P01",
  });
}

describe("isInvalidPasswordError", () => {
  it("matches only the 28P01 code", () => {
    assert.equal(isInvalidPasswordError(invalidPassword()), true);
    assert.equal(
      isInvalidPasswordError(Object.assign(new Error("x"), { code: "ECONNREFUSED" })),
      false,
    );
    assert.equal(isInvalidPasswordError(new Error("x")), false);
    assert.equal(isInvalidPasswordError(null), false);
  });
});

describe("passwordProvider", () => {
  it("returns the cached password until the source is invalidated", async () => {
    const { source, calls } = rotatingSource();
    const password = passwordProvider(source);
    assert.equal(await password(), "p1");
    assert.equal(await password(), "p1");
    source.invalidate();
    assert.equal(await password(), "p2");
    assert.equal(calls(), 2);
  });
});

describe("attachCredentialSource", () => {
  it("sets the username from the secret before connecting", async () => {
    const { source } = rotatingSource();
    const pool = attachCredentialSource(fakePool(() => null), source);
    await pool.connect();
    assert.equal(pool.options.user, "user1");
    assert.equal(pool.attempts, 1);
  });

  it("invalidates the cache on a rejected password so the next connection refetches", async () => {
    const { source, calls } = rotatingSource();
    let reject = true;
    const pool = attachCredentialSource(
      fakePool(() => (reject ? invalidPassword() : null)),
      source,
    );
    await assert.rejects(pool.connect(), /password authentication failed/);
    assert.equal(calls(), 1);

    reject = false;
    await pool.connect();
    assert.equal(calls(), 2);
    assert.equal(pool.options.user, "user2");
  });

  it("keeps the cache on other connection errors", async () => {
    const { source, calls } = rotatingSource();
    const pool = attachCredentialSource(
      fakePool(() => Object.assign(new Error("refused"), { code: "ECONNREFUSED" })),
      source,
    );
    await assert.rejects(pool.connect(), /refused/);
    await assert.rejects(pool.connect(), /refused/);
    assert.equal(calls(), 1);
  });

  it("supports the callback form and reports the rejected password there too", async () => {
    const { source, calls } = rotatingSource();
    const pool = attachCredentialSource(fakePool(invalidPassword), source);
    const error = await new Promise<Error | undefined>((resolve) => {
      pool.connect((err) => resolve(err));
    });
    assert.equal(error?.message, "password authentication failed");
    await pool.connect().catch(() => undefined);
    assert.equal(calls(), 2);
  });
});
