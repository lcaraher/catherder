import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditResponse,
  canViewOthersResponses,
  canViewOwnResponse,
  canViewQuestionAnswers,
  type EventStatus,
} from "./response-access.ts";

const REVEALED = new Date("2026-09-12T10:00:00Z");
const UNLOCKED = new Date("2026-09-12T11:00:00Z");

describe("canEditResponse", () => {
  // Every combination of status × unlock: OPEN always editable, CLOSED
  // only with an unlock, DRAFT never.
  const cases: [EventStatus, Date | null, boolean][] = [
    ["DRAFT", null, false],
    ["DRAFT", UNLOCKED, false],
    ["OPEN", null, true],
    ["OPEN", UNLOCKED, true],
    ["CLOSED", null, false],
    ["CLOSED", UNLOCKED, true],
  ];

  for (const [eventStatus, editUnlockedAt, expected] of cases) {
    it(`${eventStatus}, ${editUnlockedAt ? "unlocked" : "no unlock"} -> ${expected}`, () => {
      assert.equal(canEditResponse({ eventStatus, editUnlockedAt }), expected);
    });
  }

  it("a CLOSED event is editable with an organizer-granted unlock", () => {
    assert.equal(
      canEditResponse({ eventStatus: "CLOSED", editUnlockedAt: UNLOCKED }),
      true,
    );
  });

  it("an OPEN event is editable without any unlock", () => {
    assert.equal(
      canEditResponse({ eventStatus: "OPEN", editUnlockedAt: null }),
      true,
    );
  });

  it("a revealed event is still editable while OPEN", () => {
    // Sharing results must never lock editing: the rule takes no
    // resultsRevealedAt input at all.
    const revealedOpenEvent = {
      eventStatus: "OPEN" as EventStatus,
      editUnlockedAt: null,
      resultsRevealedAt: REVEALED,
    };
    assert.equal(canEditResponse(revealedOpenEvent), true);
  });
});

describe("canViewOthersResponses", () => {
  const cases: [boolean, Date | null, boolean][] = [
    [true, null, true],
    [true, REVEALED, true],
    [false, null, false],
    [false, REVEALED, true],
  ];

  for (const [viewerIsManager, resultsRevealedAt, expected] of cases) {
    it(`${viewerIsManager ? "manager" : "participant"}, ${
      resultsRevealedAt ? "revealed" : "not revealed"
    } -> ${expected}`, () => {
      assert.equal(
        canViewOthersResponses({ viewerIsManager, resultsRevealedAt }),
        expected,
      );
    });
  }
});

describe("canViewOwnResponse", () => {
  it("is always true", () => {
    assert.equal(canViewOwnResponse(), true);
  });
});

describe("canViewQuestionAnswers", () => {
  // Every combination of viewer × event reveal × question reveal.
  const cases: [boolean, Date | null, boolean, boolean][] = [
    [true, null, false, true],
    [true, null, true, true],
    [true, REVEALED, false, true],
    [true, REVEALED, true, true],
    [false, null, false, false],
    [false, null, true, false],
    [false, REVEALED, false, false],
    [false, REVEALED, true, true],
  ];

  for (const [
    viewerIsManager,
    resultsRevealedAt,
    answersRevealed,
    expected,
  ] of cases) {
    it(`${viewerIsManager ? "manager" : "participant"}, results ${
      resultsRevealedAt ? "revealed" : "hidden"
    }, question ${answersRevealed ? "revealed" : "hidden"} -> ${expected}`, () => {
      assert.equal(
        canViewQuestionAnswers({
          viewerIsManager,
          resultsRevealedAt,
          answersRevealed,
        }),
        expected,
      );
    });
  }
});
