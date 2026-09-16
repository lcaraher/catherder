import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  codeChallengeS256,
  generateCodeVerifier,
  generateState,
} from "./pkce.ts";

const UNRESERVED = /^[A-Za-z0-9\-._~]+$/;

describe("generateCodeVerifier", () => {
  it("is 43 to 128 unreserved characters", () => {
    for (let i = 0; i < 50; i++) {
      const verifier = generateCodeVerifier();
      assert.ok(verifier.length >= 43 && verifier.length <= 128);
      assert.match(verifier, UNRESERVED);
    }
  });

  it("differs between calls", () => {
    assert.notEqual(generateCodeVerifier(), generateCodeVerifier());
  });
});

describe("codeChallengeS256", () => {
  it("matches the RFC 7636 appendix B vector", () => {
    assert.equal(
      codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("is base64url without padding", () => {
    const challenge = codeChallengeS256(generateCodeVerifier());
    assert.equal(challenge.length, 43);
    assert.match(challenge, UNRESERVED);
  });
});

describe("generateState", () => {
  it("is non-empty, unreserved, and differs between calls", () => {
    const state = generateState();
    assert.ok(state.length >= 16);
    assert.match(state, UNRESERVED);
    assert.notEqual(state, generateState());
  });
});
