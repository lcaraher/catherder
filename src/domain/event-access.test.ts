import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canManageEvent,
  isAdminOverride,
  type EventAccessInput,
} from "./event-access.ts";

const GM = "user-gm";
const OTHER = "user-other";

// [description, input, canManage, adminOverride]
const cases: [string, EventAccessInput, boolean, boolean][] = [
  [
    "the GameMaster manages their own event, no override",
    { viewerUserId: GM, gmUserId: GM, viewerIsWorkspaceOrganizer: false },
    true,
    false,
  ],
  [
    "a GameMaster who is also an organizer is still not an override",
    { viewerUserId: GM, gmUserId: GM, viewerIsWorkspaceOrganizer: true },
    true,
    false,
  ],
  [
    "an organizer manages someone else's event as an admin override",
    { viewerUserId: OTHER, gmUserId: GM, viewerIsWorkspaceOrganizer: true },
    true,
    true,
  ],
  [
    "an organizer manages a GameMaster-less event, not an override",
    { viewerUserId: OTHER, gmUserId: null, viewerIsWorkspaceOrganizer: true },
    true,
    false,
  ],
  [
    "a non-organizer non-GameMaster cannot manage",
    { viewerUserId: OTHER, gmUserId: GM, viewerIsWorkspaceOrganizer: false },
    false,
    false,
  ],
  [
    "a non-organizer cannot manage a GameMaster-less event",
    { viewerUserId: OTHER, gmUserId: null, viewerIsWorkspaceOrganizer: false },
    false,
    false,
  ],
];

describe("canManageEvent", () => {
  for (const [name, input, expected] of cases) {
    it(`${name} -> ${expected}`, () => {
      assert.equal(canManageEvent(input), expected);
    });
  }
});

describe("isAdminOverride", () => {
  for (const [name, input, , expected] of cases) {
    it(`${name} -> ${expected}`, () => {
      assert.equal(isAdminOverride(input), expected);
    });
  }

  it("never true for a viewer who cannot manage the event", () => {
    for (const [, input] of cases) {
      if (!canManageEvent(input)) {
        assert.equal(isAdminOverride(input), false);
      }
    }
  });
});
