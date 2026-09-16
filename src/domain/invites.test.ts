import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  canRedeemInvite,
  formatInviteCode,
  generateInviteCode,
  inviteCodeFromBytes,
  normalizeInviteCode,
  type EventStatus,
} from "./invites.ts";

const ARCHIVED = new Date("2026-09-16T09:00:00Z");

describe("INVITE_CODE_ALPHABET", () => {
  it("is Crockford base32: 32 symbols, none of I, L, O, U", () => {
    assert.equal(INVITE_CODE_ALPHABET.length, 32);
    assert.equal(new Set(INVITE_CODE_ALPHABET).size, 32);
    for (const banned of ["I", "L", "O", "U"]) {
      assert.equal(INVITE_CODE_ALPHABET.includes(banned), false);
    }
    assert.equal(INVITE_CODE_ALPHABET, INVITE_CODE_ALPHABET.toUpperCase());
  });
});

describe("inviteCodeFromBytes", () => {
  it("maps each byte modulo 32 onto the alphabet", () => {
    const bytes = Uint8Array.from([0, 1, 31, 32, 33, 255, 64, 95, 200, 10]);
    assert.equal(inviteCodeFromBytes(bytes), "01Z01Z0Z8A");
  });

  it("uses only the first ten bytes", () => {
    const bytes = Uint8Array.from([...Array(10).fill(0), 5, 6]);
    assert.equal(inviteCodeFromBytes(bytes), "0000000000");
  });

  it("refuses fewer than ten bytes", () => {
    assert.throws(() => inviteCodeFromBytes(Uint8Array.from([1, 2, 3])));
  });
});

describe("generateInviteCode", () => {
  it("returns ten alphabet characters from real randomness", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      assert.equal(code.length, INVITE_CODE_LENGTH);
      assert.equal(normalizeInviteCode(code), code);
    }
  });

  it("asks the random source for exactly ten bytes", () => {
    let requested = 0;
    const code = generateInviteCode((size) => {
      requested = size;
      return new Uint8Array(size).fill(11);
    });
    assert.equal(requested, INVITE_CODE_LENGTH);
    assert.equal(code, "BBBBBBBBBB");
  });

  it("round-trips through display and normalization", () => {
    const code = generateInviteCode();
    assert.equal(normalizeInviteCode(formatInviteCode(code)), code);
  });
});

describe("normalizeInviteCode", () => {
  it("upper-cases and drops hyphens and spaces", () => {
    assert.equal(normalizeInviteCode("abcde-fghjk"), "ABCDEFGHJK");
    assert.equal(normalizeInviteCode("  abcde fghjk "), "ABCDEFGHJK");
    assert.equal(normalizeInviteCode("AB-CD-EF-GH-JK"), "ABCDEFGHJK");
    assert.equal(normalizeInviteCode("abcde\tfghjk\n"), "ABCDEFGHJK");
  });

  it("leaves a canonical code unchanged", () => {
    assert.equal(normalizeInviteCode("0123456789"), "0123456789");
  });

  it("rejects the wrong length", () => {
    assert.equal(normalizeInviteCode(""), null);
    assert.equal(normalizeInviteCode("ABCDE-FGHJ"), null);
    assert.equal(normalizeInviteCode("ABCDE-FGHJKM"), null);
    assert.equal(normalizeInviteCode("-----"), null);
  });

  it("rejects characters outside the alphabet", () => {
    assert.equal(normalizeInviteCode("ABCDEFGHIJ"), null);
    assert.equal(normalizeInviteCode("ABCDEFGHJL"), null);
    assert.equal(normalizeInviteCode("ABCDEFGHJO"), null);
    assert.equal(normalizeInviteCode("ABCDEFGHJU"), null);
    assert.equal(normalizeInviteCode("ABCDE_FGHJK"), null);
    assert.equal(normalizeInviteCode("ABCDE.FGHJK"), null);
  });
});

describe("formatInviteCode", () => {
  it("groups as five-hyphen-five", () => {
    assert.equal(formatInviteCode("ABCDEFGHJK"), "ABCDE-FGHJK");
  });
});

describe("canRedeemInvite", () => {
  const cases: [EventStatus, Date | null, boolean][] = [
    ["OPEN", null, true],
    ["DRAFT", null, false],
    ["CLOSED", null, false],
    ["OPEN", ARCHIVED, false],
    ["DRAFT", ARCHIVED, false],
    ["CLOSED", ARCHIVED, false],
  ];
  for (const [eventStatus, archivedAt, expected] of cases) {
    it(`${eventStatus}, ${archivedAt ? "archived" : "not archived"} -> ${expected}`, () => {
      assert.equal(canRedeemInvite({ eventStatus, archivedAt }), expected);
    });
  }
});
