import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSessionSecret, type SecretFetcher } from "./session-secret.ts";

const ARN = "arn:aws:secretsmanager:us-east-2:1:secret:session";

// Fake fetcher that returns a fixed value and counts calls.
function fakeFetcher(value: string): { fetcher: SecretFetcher; calls: () => number } {
  let n = 0;
  return {
    fetcher: async (arn) => {
      assert.equal(arn, ARN);
      n += 1;
      return value;
    },
    calls: () => n,
  };
}

describe("resolveSessionSecret", () => {
  it("returns the env value untouched and never calls the fetcher", async () => {
    const { fetcher, calls } = fakeFetcher("from-arn");
    const secret = await resolveSessionSecret(
      { AUTH_SESSION_SECRET: " env-value ", AUTH_SESSION_SECRET_ARN: ARN },
      fetcher,
    );
    assert.equal(secret, " env-value ");
    assert.equal(calls(), 0);
  });

  it("fetches the value by ARN when the env value is unset", async () => {
    const { fetcher, calls } = fakeFetcher("from-arn");
    const secret = await resolveSessionSecret(
      { AUTH_SESSION_SECRET_ARN: ARN },
      fetcher,
    );
    assert.equal(secret, "from-arn");
    assert.equal(calls(), 1);
  });

  it("throws when the fetched value is empty", async () => {
    const { fetcher } = fakeFetcher("");
    await assert.rejects(
      resolveSessionSecret({ AUTH_SESSION_SECRET_ARN: ARN }, fetcher),
      /empty/,
    );
  });

  it("returns undefined when neither variable is set", async () => {
    const { fetcher, calls } = fakeFetcher("from-arn");
    assert.equal(await resolveSessionSecret({}, fetcher), undefined);
    assert.equal(
      await resolveSessionSecret(
        { AUTH_SESSION_SECRET: "", AUTH_SESSION_SECRET_ARN: "" },
        fetcher,
      ),
      undefined,
    );
    assert.equal(calls(), 0);
  });
});
