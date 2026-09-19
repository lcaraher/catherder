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
      viewerIsSiteAdmin: false,
    },
    true,
    false,
  ],
  [
    "an Organizer who is also a site admin is still not an override",
    {
      viewerUserId: ORGANIZER,
      organizerUserId: ORGANIZER,
      viewerIsSiteAdmin: true,
    },
    true,
    false,
  ],
  [
    "a site admin manages someone else's event as an admin override",
    {
      viewerUserId: OTHER,
      organizerUserId: ORGANIZER,
      viewerIsSiteAdmin: true,
    },
    true,
    true,
  ],
  [
    "someone who is neither a site admin nor the Organizer cannot manage",
    {
      viewerUserId: OTHER,
      organizerUserId: ORGANIZER,
      viewerIsSiteAdmin: false,
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
