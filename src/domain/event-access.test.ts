import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canManageEvent,
  isAdminOverride,
  type EventAccessInput,
} from "./event-access.ts";

const ORGANIZER = "user-organizer";
const OTHER = "user-other";

// [description, input, canManage, adminOverride]
const cases: [string, EventAccessInput, boolean, boolean][] = [
  [
    "the Organizer manages their own event, no override",
    {
      viewerUserId: ORGANIZER,
      organizerUserId: ORGANIZER,
      viewerIsWorkspaceOrganizer: false,
    },
    true,
    false,
  ],
  [
    "an Organizer who is also a workspace admin is still not an override",
    {
      viewerUserId: ORGANIZER,
      organizerUserId: ORGANIZER,
      viewerIsWorkspaceOrganizer: true,
    },
    true,
    false,
  ],
  [
    "a workspace admin manages someone else's event as an admin override",
    {
      viewerUserId: OTHER,
      organizerUserId: ORGANIZER,
      viewerIsWorkspaceOrganizer: true,
    },
    true,
    true,
  ],
  [
    "a workspace admin manages an Organizer-less event, not an override",
    {
      viewerUserId: OTHER,
      organizerUserId: null,
      viewerIsWorkspaceOrganizer: true,
    },
    true,
    false,
  ],
  [
    "a plain member who is not the Organizer cannot manage",
    {
      viewerUserId: OTHER,
      organizerUserId: ORGANIZER,
      viewerIsWorkspaceOrganizer: false,
    },
    false,
    false,
  ],
  [
    "a plain member cannot manage an Organizer-less event",
    {
      viewerUserId: OTHER,
      organizerUserId: null,
      viewerIsWorkspaceOrganizer: false,
    },
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
