"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EventMode, QuestionType, WorkspaceRole } from "@prisma/client";
import { ForbiddenError, requireRole, requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";

const ORGANIZER_ROLES: WorkspaceRole[] = ["OWNER", "ORGANIZER"];
const EVENT_MODES: EventMode[] = ["GM_GROUPS", "SINGLE_ACTIVITY"];
const QUESTION_TYPES: QuestionType[] = [
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "TEXT",
  "RANKING",
];

// Every action re-authorizes server-side; forms only decide what's visible.
async function requireOrganizerForEvent(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("event not found");
  const { user } = await requireRole(event.workspaceId, ORGANIZER_ROLES);
  return { event, user };
}

// The results/unlock controls are also open to the event's GameMaster, who
// may hold only PARTICIPANT workspace membership. Authorization still comes
// from the database, never from IdP claims: via requireRole, with the
// GameMaster fallback read from Event.gmUserId.
async function requireOrganizerOrGmForEvent(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("event not found");
  try {
    const { user } = await requireRole(event.workspaceId, ORGANIZER_ROLES);
    return { event, user };
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
    const user = await requireUser();
    if (event.gmUserId !== user.id) throw error;
    return { event, user };
  }
}

function eventPath(workspaceId: string, eventId: string): string {
  return `/w/${workspaceId}/events/${eventId}`;
}

function optionalSize(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  return Number(text);
}

interface EventFields {
  name: string;
  requiredSlots: number;
  minGroupSize: number | null;
  maxGroupSize: number | null;
}

// Shared by create and edit so both enforce identical rules. Returns the
// parsed fields or the first validation error.
function parseEventFields(
  formData: FormData,
): { fields: EventFields } | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const targetHours = Number(String(formData.get("targetHours") ?? ""));
  // The form works in hours with 0.5 steps; storage is half-hour slots.
  const requiredSlots = Math.round(targetHours * 2);
  const minGroupSize = optionalSize(formData.get("minGroupSize"));
  const maxGroupSize = optionalSize(formData.get("maxGroupSize"));

  if (name === "") return { error: "Name is required." };
  if (
    !Number.isFinite(targetHours) ||
    requiredSlots < 1 ||
    Math.abs(targetHours * 2 - requiredSlots) > 1e-9
  ) {
    return {
      error:
        "Target session length must be at least half an hour, in half-hour steps.",
    };
  }
  for (const size of [minGroupSize, maxGroupSize]) {
    if (size !== null && (!Number.isInteger(size) || size < 1)) {
      return { error: "Group sizes must be whole numbers of at least 1." };
    }
  }
  if (
    minGroupSize !== null &&
    maxGroupSize !== null &&
    minGroupSize > maxGroupSize
  ) {
    return { error: "Min group size cannot exceed max group size." };
  }
  return { fields: { name, requiredSlots, minGroupSize, maxGroupSize } };
}

export async function createEvent(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const { user } = await requireRole(workspaceId, ORGANIZER_ROLES);

  const mode = String(formData.get("mode") ?? "") as EventMode;
  const gmUserId = String(formData.get("gmUserId") ?? "").trim() || null;

  function fail(message: string): never {
    redirect(
      `/w/${workspaceId}/events/new?error=${encodeURIComponent(message)}`,
    );
  }

  const parsed = parseEventFields(formData);
  if ("error" in parsed) fail(parsed.error);
  if (!EVENT_MODES.includes(mode)) fail("Choose a mode.");
  if (mode === "GM_GROUPS") {
    if (!gmUserId) fail("GameMaster groups mode needs a GameMaster.");
    const gmMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: gmUserId } },
    });
    if (!gmMembership) fail("The GameMaster must be a workspace member.");
  }

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        workspaceId,
        mode,
        gmUserId: mode === "GM_GROUPS" ? gmUserId : null,
        status: "DRAFT",
        ...parsed.fields,
      },
    });
    // The GameMaster is always a participant of their own event.
    if (created.gmUserId) {
      await tx.eventParticipant.create({
        data: {
          eventId: created.id,
          userId: created.gmUserId,
          role: "GAMEMASTER",
          responseStatus: "INVITED",
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: created.id,
        action: "create",
      },
    });
    return created;
  });

  redirect(eventPath(workspaceId, event.id));
}

export async function updateEvent(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const { event } = await requireOrganizerForEvent(eventId);
  const gmUserId = String(formData.get("gmUserId") ?? "").trim() || null;

  function fail(message: string): never {
    redirect(
      `${eventPath(event.workspaceId, eventId)}?error=${encodeURIComponent(message)}`,
    );
  }

  const parsed = parseEventFields(formData);
  if ("error" in parsed) fail(parsed.error);
  if (event.mode === "GM_GROUPS") {
    if (!gmUserId) fail("GameMaster groups mode needs a GameMaster.");
    const gmMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: event.workspaceId, userId: gmUserId },
      },
    });
    if (!gmMembership) fail("The GameMaster must be a workspace member.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: eventId },
      data: {
        ...parsed.fields,
        ...(event.mode === "GM_GROUPS" ? { gmUserId } : {}),
      },
    });
    // Moving the GameMaster moves the GAMEMASTER participant row: the new GM
    // is added if absent, the previous GM stays on as a PLAYER.
    if (event.mode === "GM_GROUPS" && gmUserId && gmUserId !== event.gmUserId) {
      if (event.gmUserId) {
        await tx.eventParticipant.updateMany({
          where: { eventId, userId: event.gmUserId },
          data: { role: "PLAYER" },
        });
      }
      await tx.eventParticipant.upsert({
        where: { eventId_userId: { eventId, userId: gmUserId } },
        update: { role: "GAMEMASTER" },
        create: {
          eventId,
          userId: gmUserId,
          role: "GAMEMASTER",
          responseStatus: "INVITED",
        },
      });
    }
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
  redirect(eventPath(event.workspaceId, eventId));
}

export async function setEventStatus(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "OPEN" && status !== "CLOSED") return;
  const { event, user } = await requireOrganizerForEvent(eventId);
  if (event.status === status) return;

  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { status } });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: status === "OPEN" ? "open" : "close",
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

export async function setResultsRevealed(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const revealed = String(formData.get("revealed") ?? "") === "true";
  const { event, user } = await requireOrganizerOrGmForEvent(eventId);
  if ((event.resultsRevealedAt !== null) === revealed) return;

  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: eventId },
      data: { resultsRevealedAt: revealed ? new Date() : null },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: revealed ? "results_revealed" : "results_hidden",
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

// The usual end-of-collection step: stop accepting responses and show
// everyone the results in one go. One transaction so the status change, the
// reveal, and their audit trail land together or not at all.
export async function closeEventAndShareResults(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireOrganizerOrGmForEvent(eventId);
  if (event.status !== "OPEN") return;

  const alreadyRevealed = event.resultsRevealedAt !== null;
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: eventId },
      data: {
        status: "CLOSED",
        ...(alreadyRevealed ? {} : { resultsRevealedAt: new Date() }),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: "close",
      },
    });
    if (!alreadyRevealed) {
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          entity: "Event",
          entityId: eventId,
          action: "results_revealed",
        },
      });
    }
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

export async function setParticipantEditLock(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const unlocked = String(formData.get("unlocked") ?? "") === "true";
  const { event, user } = await requireOrganizerOrGmForEvent(eventId);

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  if (!participant) return;
  if ((participant.editUnlockedAt !== null) === unlocked) return;

  await prisma.$transaction(async (tx) => {
    await tx.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { editUnlockedAt: unlocked ? new Date() : null },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "EventParticipant",
        // Opaque IDs only in audit rows — never email addresses.
        entityId: `${eventId}:${userId}`,
        action: unlocked ? "response_unlocked" : "response_relocked",
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

export async function addParticipant(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const { event } = await requireOrganizerForEvent(eventId);

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: event.workspaceId, userId } },
  });
  if (!membership) return;

  await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: {},
    create: {
      eventId,
      userId,
      role: userId === event.gmUserId ? "GAMEMASTER" : "PLAYER",
      responseStatus: "INVITED",
    },
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

export async function removeParticipant(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const { event } = await requireOrganizerForEvent(eventId);

  // The event's GameMaster cannot be removed while they hold that role.
  if (userId === event.gmUserId) return;
  await prisma.eventParticipant.deleteMany({ where: { eventId, userId } });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

export async function addQuestion(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const type = String(formData.get("type") ?? "") as QuestionType;
  const prompt = String(formData.get("prompt") ?? "").trim();
  const optionLines = String(formData.get("options") ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const { event } = await requireOrganizerForEvent(eventId);

  if (!QUESTION_TYPES.includes(type) || prompt === "") return;
  if (type !== "TEXT" && optionLines.length === 0) return;
  if (type === "RANKING" && optionLines.length < 2) return;

  const count = await prisma.question.count({ where: { eventId } });
  await prisma.question.create({
    data: {
      eventId,
      type,
      prompt,
      version: 1,
      displayOrder: count,
      options:
        type === "TEXT"
          ? undefined
          : {
              create: optionLines.map((label, i) => ({
                label,
                displayOrder: i,
              })),
            },
    },
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

export async function reorderQuestion(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") return;
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question) return;
  const { event } = await requireOrganizerForEvent(question.eventId);

  const neighbor = await prisma.question.findFirst({
    where: {
      eventId: question.eventId,
      displayOrder:
        direction === "up"
          ? { lt: question.displayOrder }
          : { gt: question.displayOrder },
    },
    orderBy: { displayOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.question.update({
      where: { id: question.id },
      data: { displayOrder: neighbor.displayOrder },
    }),
    prisma.question.update({
      where: { id: neighbor.id },
      data: { displayOrder: question.displayOrder },
    }),
  ]);
  revalidatePath(eventPath(event.workspaceId, question.eventId));
}

export async function updateQuestionPrompt(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (prompt === "") return;
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question) return;
  const { event } = await requireOrganizerForEvent(question.eventId);

  // Once answers exist the answered version is preserved: the edit bumps the
  // question's version, and Answer.questionVersion keeps recording which
  // version each answer was for.
  const answered = (await prisma.answer.count({ where: { questionId } })) > 0;
  await prisma.question.update({
    where: { id: questionId },
    data: { prompt, ...(answered ? { version: { increment: 1 } } : {}) },
  });
  revalidatePath(eventPath(event.workspaceId, question.eventId));
}

export async function addQuestionOption(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (label === "") return;
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question || question.type === "TEXT") return;
  const { event } = await requireOrganizerForEvent(question.eventId);

  const answered = (await prisma.answer.count({ where: { questionId } })) > 0;
  const count = await prisma.questionOption.count({ where: { questionId } });
  await prisma.$transaction(async (tx) => {
    await tx.questionOption.create({
      data: { questionId, label, displayOrder: count },
    });
    if (answered) {
      await tx.question.update({
        where: { id: questionId },
        data: { version: { increment: 1 } },
      });
    }
  });
  revalidatePath(eventPath(event.workspaceId, question.eventId));
}

export async function removeQuestionOption(formData: FormData) {
  const optionId = String(formData.get("optionId") ?? "");
  const option = await prisma.questionOption.findUnique({
    where: { id: optionId },
    include: { question: true },
  });
  if (!option) return;
  const { event } = await requireOrganizerForEvent(option.question.eventId);

  // Options are only removable while nothing references them; once answers
  // exist the choices must stay intact.
  const answered =
    (await prisma.answer.count({ where: { questionId: option.questionId } })) >
    0;
  if (answered) return;
  await prisma.questionOption.delete({ where: { id: optionId } });
  revalidatePath(eventPath(event.workspaceId, option.question.eventId));
}
