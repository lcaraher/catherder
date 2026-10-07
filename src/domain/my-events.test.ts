import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  myEventCards,
  type MyOrganizedEvent,
  type MyParticipation,
} from "./my-events.ts";

const OLD = new Date("2026-09-01T00:00:00Z");
const NEW = new Date("2026-10-01T00:00:00Z");

function participation(
  overrides: Partial<Omit<MyParticipation, "event">> & {
    event?: Partial<MyParticipation["event"]>;
  } = {},
): MyParticipation {
  const { event, ...rest } = overrides;
  return {
    role: "PLAYER",
    responseStatus: "INVITED",
    editUnlockedAt: null,
    ...rest,
    event: {
      id: "e1",
      name: "Kickoff",
      status: "OPEN",
      resultsRevealedAt: null,
      archivedAt: null,
      organizerParticipates: false,
      createdAt: OLD,
      organizerName: "Greta",
      ...event,
    },
  };
}

function organizedEvent(overrides: Partial<MyOrganizedEvent> = {}): MyOrganizedEvent {
  return {
    id: "e1",
    name: "Kickoff",
    status: "OPEN",
    archivedAt: null,
    createdAt: OLD,
    organizerName: "Greta",
    ...overrides,
  };
}

describe("myEventCards", () => {
  it("gives an organizer who doesn't take part one organizer card", () => {
    const cards = myEventCards({
      participations: [
        participation({
          role: "ORGANIZER",
          event: { resultsRevealedAt: NEW },
        }),
      ],
      organized: [organizedEvent()],
    });
    assert.deepEqual(cards, [
      {
        eventId: "e1",
        name: "Kickoff",
        organizerName: "Greta",
        status: "OPEN",
        response: null,
        organizer: true,
        resultsShared: false,
      },
    ]);
  });

  it("merges a taking-part organizer's response and organizer role into one card", () => {
    const cards = myEventCards({
      participations: [
        participation({
          role: "ORGANIZER",
          responseStatus: "SUBMITTED",
          event: { organizerParticipates: true, resultsRevealedAt: NEW },
        }),
      ],
      organized: [organizedEvent()],
    });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].response, "editable");
    assert.equal(cards[0].organizer, true);
    assert.equal(cards[0].resultsShared, true);
  });

  it("asks an invited player on an open event to respond", () => {
    const cards = myEventCards({ participations: [participation()], organized: [] });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].response, "todo");
    assert.equal(cards[0].organizer, false);
  });

  it("locks a submitted response on a draft", () => {
    const cards = myEventCards({
      participations: [
        participation({ responseStatus: "SUBMITTED", event: { status: "DRAFT" } }),
      ],
      organized: [],
    });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].response, "locked");
  });

  it("leaves an invited player's draft off the list", () => {
    const cards = myEventCards({
      participations: [participation({ event: { status: "DRAFT" } })],
      organized: [],
    });
    assert.deepEqual(cards, []);
  });

  it("leaves archived events off the list", () => {
    const archivedAt = NEW;
    const cards = myEventCards({
      participations: [participation({ event: { id: "e1", archivedAt } })],
      organized: [organizedEvent({ id: "e2", archivedAt })],
    });
    assert.deepEqual(cards, []);
  });

  it("keeps a submitted response editable on a closed event with an unlock", () => {
    const cards = myEventCards({
      participations: [
        participation({
          responseStatus: "SUBMITTED",
          editUnlockedAt: NEW,
          event: { status: "CLOSED" },
        }),
      ],
      organized: [],
    });
    assert.equal(cards[0].response, "editable");
  });

  it("puts responses to give first, then newest event first", () => {
    const cards = myEventCards({
      participations: [
        participation({ event: { id: "todo-old", createdAt: OLD } }),
        participation({
          responseStatus: "SUBMITTED",
          event: { id: "done-new", createdAt: NEW },
        }),
        participation({ event: { id: "todo-new", createdAt: NEW } }),
      ],
      organized: [organizedEvent({ id: "run-old", createdAt: OLD })],
    });
    assert.deepEqual(
      cards.map((c) => c.eventId),
      ["todo-new", "todo-old", "done-new", "run-old"],
    );
  });
});
