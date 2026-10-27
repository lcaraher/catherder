import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { referenceNow, resetReferenceNowForTests } from "./reference-now.ts";

// Sets the environment for one call and puts it back afterwards.
function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const env = process.env as Record<string, string | undefined>;
  const set = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  };
  set(values);
  try {
    return run();
  } finally {
    set(saved);
  }
}

// Asserts the date was taken from the clock during run().
function assertCurrentTime(run: () => Date): void {
  const before = Date.now();
  const result = run().getTime();
  assert.ok(result >= before && result <= Date.now());
}

describe("referenceNow", () => {
  afterEach(() => {
    mock.restoreAll();
    resetReferenceNowForTests();
  });

  it("is the current time when OVERLAP_REFERENCE_DATE is unset", () => {
    assertCurrentTime(() =>
      withEnv({ OVERLAP_REFERENCE_DATE: undefined, NODE_ENV: "development" }, referenceNow),
    );
  });

  it("is the given day at 12:00 UTC when OVERLAP_REFERENCE_DATE is valid", () => {
    const result = withEnv(
      { OVERLAP_REFERENCE_DATE: "2026-10-12", NODE_ENV: "development" },
      referenceNow,
    );
    assert.equal(result.toISOString(), "2026-10-12T12:00:00.000Z");
  });

  it("ignores an invalid value with one warning naming only the variable", () => {
    const warn = mock.method(console, "warn", () => {});
    for (const value of ["2026-13-40", "soon"]) {
      assertCurrentTime(() =>
        withEnv({ OVERLAP_REFERENCE_DATE: value, NODE_ENV: "development" }, referenceNow),
      );
    }
    assert.equal(warn.mock.callCount(), 1);
    const message = String(warn.mock.calls[0].arguments[0]);
    assert.match(message, /OVERLAP_REFERENCE_DATE/);
    assert.doesNotMatch(message, /2026-13-40|soon/);
  });

  it("ignores a valid value in production", () => {
    assertCurrentTime(() =>
      withEnv({ OVERLAP_REFERENCE_DATE: "2026-10-12", NODE_ENV: "production" }, referenceNow),
    );
  });
});
