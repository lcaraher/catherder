"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/adapters/db/client";
import { saveError, saved, type SaveResult } from "@/domain/save-result";
import { requireEventManager } from "../manage/event-manager";

/** The field as a whole number, or null when it is anything else. */
function wholeNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

export async function savePlanningSettings(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);

  const lengthSlots = wholeNumber(formData.get("lengthSlots"));
  if (lengthSlots === null || lengthSlots < 1 || lengthSlots > 16) {
    return saveError("Choose a session length.", "lengthSlots");
  }
  const minPeople = wholeNumber(formData.get("minPeople"));
  if (minPeople === null || minPeople < 2 || minPeople > 200) {
    return saveError("Choose how many people.", "minPeople");
  }
  const organizerMustAttend = formData.get("organizerMustAttend") === "on";
  const nearlyText = String(formData.get("nearlySlots") ?? "").trim();
  const nearlySlots = nearlyText === "" ? null : wholeNumber(nearlyText);
  if (
    nearlyText !== "" &&
    (nearlySlots === null || nearlySlots < 1 || nearlySlots > 6 || nearlySlots >= lengthSlots)
  ) {
    return saveError("Choose a window shorter than the session.", "nearlySlots");
  }

  const from = {
    requiredSlots: event.requiredSlots,
    planningMinPeople: event.planningMinPeople,
    planningOrganizerMustAttend: event.planningOrganizerMustAttend,
    planningNearlySlots: event.planningNearlySlots,
  };
  const to = {
    requiredSlots: lengthSlots,
    planningMinPeople: minPeople,
    planningOrganizerMustAttend: organizerMustAttend,
    planningNearlySlots: nearlySlots,
  };
  if ((Object.keys(to) as (keyof typeof to)[]).every((key) => from[key] === to[key])) {
    return saved();
  }

  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: to });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: "planning_settings_changed",
        detail: { from, to },
      },
    });
  });
  revalidatePath(`/e/${eventId}/responses`);
  revalidatePath(`/e/${eventId}/manage`);
  return saved();
}

const MAX_SHARED_TIMES = 20;
const LAST_WEEK_SLOT = 335;

/** The comma-separated week slots, or null when any is invalid, repeated or too many. */
function sharedStarts(value: FormDataEntryValue | null): number[] | null {
  const text = String(value ?? "").trim();
  if (text === "") return [];
  const starts = text.split(",").map(wholeNumber);
  if (starts.some((start) => start === null || start > LAST_WEEK_SLOT)) return null;
  if (new Set(starts).size !== starts.length || starts.length > MAX_SHARED_TIMES) return null;
  return starts as number[];
}

type SharedTime = { startSlot: number; timeZone: string; lengthSlots: number };

const byStart = (a: SharedTime, b: SharedTime) =>
  a.startSlot - b.startSlot || a.timeZone.localeCompare(b.timeZone) || a.lengthSlots - b.lengthSlots;

export async function shareTimes(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  if (event.mode !== "SINGLE_ACTIVITY") {
    return saveError("Sharing times is for single-activity events.", "starts");
  }
  const starts = sharedStarts(formData.get("starts"));
  if (starts === null) return saveError("Choose the times to share.", "starts");

  const existing = await prisma.eventSharedTime.findMany({
    where: { eventId },
    select: { startSlot: true, timeZone: true, lengthSlots: true },
  });
  const from = existing.sort(byStart);
  // Zone and length come from the server, never from the form.
  const to = starts
    .map((startSlot) => ({ startSlot, timeZone: user.timeZone, lengthSlots: event.requiredSlots }))
    .sort(byStart);
  if (from.length === to.length && from.every((time, i) => byStart(time, to[i]) === 0)) {
    return saved();
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventSharedTime.deleteMany({ where: { eventId } });
    await tx.eventSharedTime.createMany({ data: to.map((time) => ({ eventId, ...time })) });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: "shared_times_changed",
        detail: { from, to },
      },
    });
  });
  revalidatePath(`/e/${eventId}/responses`);
  return saved();
}
