// The signed-in home page's event cards: one per event, with what the viewer may do there.
// Cards with a response to give or questions to look at come first, then newest first.

import { canEditResponse, type EventStatus } from "./response-access.ts";

export interface MyParticipation {
  role: "ORGANIZER" | "PLAYER";
  responseStatus: "INVITED" | "SUBMITTED";
  editUnlockedAt: Date | null;
  questionNotice?: { changed: number; added: number };
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
  changedQuestions: number;
  addedQuestions: number;
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
    const notice = response === "editable" ? p.questionNotice : undefined;
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
        changedQuestions: notice?.changed ?? 0,
        addedQuestions: notice?.added ?? 0,
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
        changedQuestions: 0,
        addedQuestions: 0,
      },
    });
  }

  const needsViewer = (card: EventCardData) =>
    card.response === "todo" || card.changedQuestions + card.addedQuestions > 0;
  return [...cards.values()]
    .sort(
      (a, b) =>
        Number(needsViewer(b.card)) - Number(needsViewer(a.card)) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .map(({ card }) => card);
}
