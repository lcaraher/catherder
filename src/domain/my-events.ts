// The signed-in home page's event cards: one per event, with what the viewer may do there.

import { canEditResponse, type EventStatus } from "./response-access.ts";

export interface MyParticipation {
  role: "ORGANIZER" | "PLAYER";
  responseStatus: "INVITED" | "SUBMITTED";
  editUnlockedAt: Date | null;
  event: {
    id: string;
    name: string;
    status: EventStatus;
    resultsRevealedAt: Date | null;
    archivedAt: Date | null;
    organizerParticipates: boolean;
    createdAt: Date;
    organizerName: string;
  };
}

export interface MyOrganizedEvent {
  id: string;
  name: string;
  status: EventStatus;
  archivedAt: Date | null;
  createdAt: Date;
  organizerName: string;
}

export type CardResponse = "todo" | "editable" | "locked" | null;

export interface EventCardData {
  eventId: string;
  name: string;
  organizerName: string;
  status: EventStatus;
  response: CardResponse;
  organizer: boolean;
  resultsShared: boolean;
}

function responseState(p: MyParticipation): CardResponse {
  const editable = canEditResponse({
    eventStatus: p.event.status,
    editUnlockedAt: p.editUnlockedAt,
    archivedAt: p.event.archivedAt,
  });
  if (p.responseStatus === "SUBMITTED") return editable ? "editable" : "locked";
  if (p.event.status !== "DRAFT" && editable) return "todo";
  return null;
}

export function myEventCards({
  participations,
  organized,
}: {
  participations: MyParticipation[];
  organized: MyOrganizedEvent[];
}): EventCardData[] {
  const organizedIds = new Set(
    organized.filter((e) => e.archivedAt === null).map((e) => e.id),
  );
  const cards = new Map<string, { card: EventCardData; createdAt: Date }>();

  for (const p of participations) {
    const { event } = p;
    if (event.archivedAt !== null) continue;
    if (p.role === "ORGANIZER" && !event.organizerParticipates) continue;
    const response = responseState(p);
    if (response === null && !organizedIds.has(event.id)) continue;
    cards.set(event.id, {
      createdAt: event.createdAt,
      card: {
        eventId: event.id,
        name: event.name,
        organizerName: event.organizerName,
        status: event.status,
        response,
        organizer: false,
        resultsShared: event.resultsRevealedAt !== null,
      },
    });
  }

  for (const event of organized) {
    if (event.archivedAt !== null) continue;
    const existing = cards.get(event.id);
    if (existing) {
      existing.card.organizer = true;
      continue;
    }
    cards.set(event.id, {
      createdAt: event.createdAt,
      card: {
        eventId: event.id,
        name: event.name,
        organizerName: event.organizerName,
        status: event.status,
        response: null,
        organizer: true,
        resultsShared: false,
      },
    });
  }

  return [...cards.values()]
    .sort(
      (a, b) =>
        Number(b.card.response === "todo") - Number(a.card.response === "todo") ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .map(({ card }) => card);
}
