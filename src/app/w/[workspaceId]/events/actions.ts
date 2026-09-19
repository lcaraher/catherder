"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EventMode, QuestionType, WorkspaceRole } from "@prisma/client";
import { ForbiddenError, requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { createInviteInTx, withFreshInviteCode } from "@/adapters/db/invites";
import { canManageEvent } from "@/domain/event-access";
import { EVENT_DESCRIPTION_MAX_LENGTH } from "@/domain/events";

const ORGANIZER_ROLES: WorkspaceRole[] = ["OWNER", "ORGANIZER"];
const EVENT_MODES: EventMode[] = ["MULTI_GROUP", "SINGLE_ACTIVITY"];
const QUESTION_TYPES: QuestionType[] = [
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "TEXT",
  "RANKING",
];

// Every action re-authorizes server-side; forms only decide what's
// visible. Management facts come from the database, never from IdP claims.
async function requireEventManager(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("event not found");
  const user = await requireUser();
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: event.workspaceId, userId: user.id },
    },
  });
  const allowed = canManageEvent({
    viewerUserId: user.id,
    organizerUserId: event.organizerUserId,
    viewerIsWorkspaceOrganizer:
      membership !== null && ORGANIZER_ROLES.includes(membership.role),
  });
  if (!allowed) {
    throw new ForbiddenError(
      "must be the event's Organizer or a workspace OWNER or ORGANIZER",
    );
  }
  return { event, user };
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
  const postedWorkspaceId = String(formData.get("workspaceId") ?? "");
  const user = await requireUser();
  if (postedWorkspaceId !== "") {
    // Any workspace member may create an event.
    const creatorMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: postedWorkspaceId, userId: user.id },
      },
    });
    if (!creatorMembership) {
      throw new ForbiddenError("workspace membership required");
    }
  } else {
    const membershipCount = await prisma.workspaceMember.count({
      where: { userId: user.id },
    });
    // Closes the race where an invite was redeemed in another tab.
    if (membershipCount !== 0) redirect("/events/new");
  }

  const mode = String(formData.get("mode") ?? "") as EventMode;
  const organizerParticipates =
    String(formData.get("organizerParticipates") ?? "") === "on";

  function fail(message: string): never {
    const formPath =
      postedWorkspaceId === ""
        ? "/events/new"
        : `/w/${postedWorkspaceId}/events/new`;
    redirect(`${formPath}?error=${encodeURIComponent(message)}`);
  }

  const parsed = parseEventFields(formData);
  if ("error" in parsed) fail(parsed.error);
  if (!EVENT_MODES.includes(mode)) fail("Choose a mode.");

  // A fresh invite is issued with the event; a code collision retries the whole transaction.
  const event = await withFreshInviteCode((inviteCode) =>
    prisma.$transaction(async (tx) => {
      // A first event gets a workspace of its own, owned by the creator.
      let workspaceId = postedWorkspaceId;
      if (workspaceId === "") {
        const workspace = await tx.workspace.create({
          data: { name: user.displayName, ownerUserId: user.id },
        });
        await tx.workspaceMember.create({
          data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
        });
        workspaceId = workspace.id;
      }
      // The creator owns every event they create; single activity has no
      // groups, so its size bounds are always null whatever the form sent.
      const created = await tx.event.create({
        data: {
          workspaceId,
          mode,
          organizerUserId: user.id,
          organizerParticipates,
          status: "DRAFT",
          ...parsed.fields,
          ...(mode === "SINGLE_ACTIVITY"
            ? { minGroupSize: null, maxGroupSize: null }
            : {}),
        },
      });
      if (postedWorkspaceId === "") {
        await tx.auditEvent.create({
          data: {
            actorUserId: user.id,
            entity: "Workspace",
            entityId: workspaceId,
            action: "created",
            detail: { eventId: created.id },
          },
        });
      }
      // The owner's participant row has role ORGANIZER in both modes, always.
      await tx.eventParticipant.create({
        data: {
          eventId: created.id,
          userId: user.id,
          role: "ORGANIZER",
          responseStatus: "INVITED",
        },
      });
      // A non-participating organizer's standing week is copied into event
      // rows at creation; a participating organizer responds instead.
      if (!organizerParticipates) {
        const standingRows = await tx.standingAvailability.findMany({
          where: { userId: user.id },
        });
        if (standingRows.length > 0) {
          const standingVersion = Math.max(
            ...standingRows.map((row) => row.version),
          );
          await tx.eventAvailability.createMany({
            data: standingRows.map((row) => ({
              eventId: created.id,
              userId: user.id,
              weekday: row.weekday,
              startLocal: row.startLocal,
              endLocal: row.endLocal,
              status: row.status,
              copiedFromStandingVersion: standingVersion,
            })),
          });
        }
      }
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          entity: "Event",
          entityId: created.id,
          action: "create",
        },
      });
      await createInviteInTx(tx, {
        eventId: created.id,
        code: inviteCode,
        actorUserId: user.id,
      });
      return created;
    }),
  );

  redirect(eventPath(event.workspaceId, event.id));
}

// For events created before invites existed; a no-op once one exists.
export async function createInvite(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  const existing = await prisma.eventInvite.findUnique({ where: { eventId } });
  if (existing) return;

  await withFreshInviteCode((code) =>
    prisma.$transaction((tx) =>
      createInviteInTx(tx, { eventId, code, actorUserId: user.id }),
    ),
  );
  revalidatePath(eventPath(event.workspaceId, eventId));
}

// Replaces the code in place: the old link and code stop working at once.
export async function regenerateInvite(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  const invite = await prisma.eventInvite.findUnique({ where: { eventId } });
  if (!invite) return;

  await withFreshInviteCode((code) =>
    prisma.$transaction(async (tx) => {
      await tx.eventInvite.update({
        where: { id: invite.id },
        data: { code, regeneratedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          entity: "EventInvite",
          entityId: invite.id,
          action: "regenerated",
          detail: { eventId },
        },
      });
    }),
  );
  revalidatePath(eventPath(event.workspaceId, eventId));
}

export async function updateEvent(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  const organizerUserId =
    String(formData.get("organizerUserId") ?? "").trim() || null;
  const organizerParticipates =
    String(formData.get("organizerParticipates") ?? "") === "on";

  function fail(message: string): never {
    redirect(
      `${eventPath(event.workspaceId, eventId)}?error=${encodeURIComponent(message)}`,
    );
  }

  const parsed = parseEventFields(formData);
  if ("error" in parsed) fail(parsed.error);
  // The owner is reassignable in both modes, but only to someone already
  // on this event's roster.
  if (!organizerUserId) fail("This event needs an Organizer.");
  const ownerParticipant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId: organizerUserId } },
  });
  if (!ownerParticipant) {
    fail("The Organizer must already be on this event.");
  }

  const participationChanged =
    organizerParticipates !== event.organizerParticipates;
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: eventId },
      data: {
        ...parsed.fields,
        organizerUserId,
        organizerParticipates,
        // Single activity has no groups; its size bounds stay null.
        ...(event.mode === "SINGLE_ACTIVITY"
          ? { minGroupSize: null, maxGroupSize: null }
          : {}),
      },
    });
    // Reassigning moves the ORGANIZER participant role to the new owner and
    // leaves the previous owner as a PLAYER, in both modes.
    if (organizerUserId !== event.organizerUserId) {
      if (event.organizerUserId) {
        await tx.eventParticipant.updateMany({
          where: { eventId, userId: event.organizerUserId },
          data: { role: "PLAYER" },
        });
      }
      await tx.eventParticipant.update({
        where: { eventId_userId: { eventId, userId: organizerUserId } },
        data: { role: "ORGANIZER" },
      });
    }
    // Flipping the switch changes nothing else; answers, availability rows,
    // and response status are all kept as they are.
    if (participationChanged) {
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          entity: "Event",
          entityId: eventId,
          action: "organizer_participation_changed",
        },
      });
    }
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
  redirect(eventPath(event.workspaceId, eventId));
}

export async function updateEventDescription(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const text = String(formData.get("description") ?? "").trim();
  const { event, user } = await requireEventManager(eventId);

  if (text.length > EVENT_DESCRIPTION_MAX_LENGTH) {
    redirect(
      `${eventPath(event.workspaceId, eventId)}?error=${encodeURIComponent(
        `The description is limited to ${EVENT_DESCRIPTION_MAX_LENGTH} characters.`,
      )}`,
    );
  }
  // Blank is stored as null so "no description" has one representation.
  const description = text === "" ? null : text;
  if (description === event.description) return;

  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { description } });
    // The previous text is kept so a wiped description can be restored by hand.
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: "event_description_edited",
        detail: { from: event.description },
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

export async function archiveEvent(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  if (event.archivedAt !== null) return;

  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: eventId },
      data: { archivedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: "event_archived",
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
  revalidatePath("/");
}

export async function unarchiveEvent(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  if (event.archivedAt === null) return;

  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: eventId },
      data: { archivedAt: null },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: "event_unarchived",
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
  revalidatePath("/");
}

export async function setEventStatus(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "OPEN" && status !== "CLOSED") return;
  const { event, user } = await requireEventManager(eventId);
  if (event.status === status) return;
  // An archived event stays as it is; unarchive it first.
  if (event.archivedAt !== null) {
    redirect(
      `${eventPath(event.workspaceId, eventId)}?error=${encodeURIComponent(
        "This event is archived. Unarchive it before opening or closing it.",
      )}`,
    );
  }

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
  const { event, user } = await requireEventManager(eventId);
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

// Stops accepting responses and reveals results in one transaction.
export async function closeEventAndShareResults(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  if (event.status !== "OPEN") return;
  // An archived event stays as it is; unarchive it first.
  if (event.archivedAt !== null) {
    redirect(
      `${eventPath(event.workspaceId, eventId)}?error=${encodeURIComponent(
        "This event is archived. Unarchive it before opening or closing it.",
      )}`,
    );
  }

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
  const { event, user } = await requireEventManager(eventId);

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
  const { event } = await requireEventManager(eventId);

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: event.workspaceId, userId } },
  });
  if (!membership) return;

  // The owner always has a row already, so anyone added here is a PLAYER.
  await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: {},
    create: {
      eventId,
      userId,
      role: "PLAYER",
      responseStatus: "INVITED",
    },
  });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

export async function removeParticipant(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const { event } = await requireEventManager(eventId);

  // The event's Organizer cannot be removed while they hold that role.
  if (userId === event.organizerUserId) return;
  await prisma.eventParticipant.deleteMany({ where: { eventId, userId } });
  revalidatePath(eventPath(event.workspaceId, eventId));
}

// Per-question participant visibility. Only takes effect once the event's
// results are shared — canViewQuestionAnswers needs both gates open.
export async function setQuestionAnswersRevealed(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  const revealed = String(formData.get("revealed") ?? "") === "true";
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question) return;
  const { event, user } = await requireEventManager(question.eventId);
  if (question.answersRevealed === revealed) return;

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: questionId },
      data: { answersRevealed: revealed },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Question",
        entityId: questionId,
        action: revealed
          ? "question_answers_revealed"
          : "question_answers_hidden",
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, question.eventId));
}

// Whether participants can submit without answering this question. Applies
// to future submissions only — existing answers are never re-validated.
export async function setQuestionRequired(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  const required = String(formData.get("required") ?? "") === "true";
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question) return;
  const { event, user } = await requireEventManager(question.eventId);
  if (question.required === required) return;

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: questionId },
      data: { required },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Question",
        entityId: questionId,
        action: required
          ? "question_required_set"
          : "question_required_cleared",
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, question.eventId));
}

export async function addQuestion(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const type = String(formData.get("type") ?? "") as QuestionType;
  const prompt = String(formData.get("prompt") ?? "").trim();
  const optionLines = String(formData.get("options") ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const { event } = await requireEventManager(eventId);

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
  const { event } = await requireEventManager(question.eventId);

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
  const { event } = await requireEventManager(question.eventId);

  // Once answers exist an edit bumps the question's version;
  // Answer.questionVersion records which version each answer was for.
  const answered = (await prisma.answer.count({ where: { questionId } })) > 0;
  await prisma.question.update({
    where: { id: questionId },
    data: { prompt, ...(answered ? { version: { increment: 1 } } : {}) },
  });
  revalidatePath(eventPath(event.workspaceId, question.eventId));
}

export async function updateQuestionOption(formData: FormData) {
  const optionId = String(formData.get("optionId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (label === "") return;
  const option = await prisma.questionOption.findUnique({
    where: { id: optionId },
    include: { question: true },
  });
  if (!option) return;
  const { event, user } = await requireEventManager(option.question.eventId);
  if (label === option.label) return;

  // Answers stay attached (the option id is unchanged); rewording an
  // answered question's option starts a fresh version, like a prompt edit.
  const answered =
    (await prisma.answer.count({
      where: { questionId: option.questionId },
    })) > 0;
  await prisma.$transaction(async (tx) => {
    await tx.questionOption.update({
      where: { id: optionId },
      data: { label },
    });
    if (answered) {
      await tx.question.update({
        where: { id: option.questionId },
        data: { version: { increment: 1 } },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "QuestionOption",
        entityId: optionId,
        action: "question_option_edited",
        detail: { optionId, from: option.label, to: label },
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, option.question.eventId));
}

// Choice questions only: whether responders get a free-text "Other".
export async function setQuestionAllowOther(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  const allowOther = String(formData.get("allowOther") ?? "") === "true";
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question) return;
  if (question.type !== "SINGLE_CHOICE" && question.type !== "MULTI_CHOICE") {
    return;
  }
  const { event, user } = await requireEventManager(question.eventId);
  if (question.allowOther === allowOther) return;

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: questionId },
      data: { allowOther },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Question",
        entityId: questionId,
        action: allowOther
          ? "question_allow_other_set"
          : "question_allow_other_cleared",
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, question.eventId));
}

export async function deleteQuestion(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      options: { orderBy: { displayOrder: "asc" } },
      answers: { include: { choices: true, text: true } },
    },
  });
  if (!question) return;
  const { event, user } = await requireEventManager(question.eventId);

  // This snapshot can hold participants' free text: it stays in the database
  // under the same protection as the answers and is never written to logs.
  const detail = {
    questionId,
    eventId: question.eventId,
    prompt: question.prompt,
    type: question.type,
    version: question.version,
    displayOrder: question.displayOrder,
    required: question.required,
    answersRevealed: question.answersRevealed,
    allowOther: question.allowOther,
    options: question.options.map((option) => ({
      optionId: option.id,
      label: option.label,
      displayOrder: option.displayOrder,
    })),
    answers: question.answers.map((answer) => ({
      userId: answer.userId,
      questionVersion: answer.questionVersion,
      choices: answer.choices.map((choice) => ({
        optionId: choice.optionId,
        rank: choice.rank,
      })),
      text: answer.text?.text ?? null,
      otherText: answer.otherText,
    })),
  };

  const answerIds = question.answers.map((answer) => answer.id);
  await prisma.$transaction(async (tx) => {
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Question",
        entityId: questionId,
        action: "question_deleted",
        detail,
      },
    });
    await tx.answerText.deleteMany({ where: { answerId: { in: answerIds } } });
    await tx.answerChoice.deleteMany({
      where: { answerId: { in: answerIds } },
    });
    await tx.answer.deleteMany({ where: { questionId } });
    await tx.questionOption.deleteMany({ where: { questionId } });
    await tx.question.delete({ where: { id: questionId } });
    // Renumber so the remaining questions' displayOrder stays 0..n-1.
    const remaining = await tx.question.findMany({
      where: { eventId: question.eventId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, displayOrder: true },
    });
    for (const [index, row] of remaining.entries()) {
      if (row.displayOrder !== index) {
        await tx.question.update({
          where: { id: row.id },
          data: { displayOrder: index },
        });
      }
    }
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
  const { event } = await requireEventManager(question.eventId);

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
  const { event, user } = await requireEventManager(option.question.eventId);

  // Choices referencing the option are dropped with it; the audit row
  // records them so an administrator can restore by hand.
  const choices = await prisma.answerChoice.findMany({
    where: { optionId },
    include: { answer: { select: { userId: true } } },
  });
  const answered =
    (await prisma.answer.count({
      where: { questionId: option.questionId },
    })) > 0;
  await prisma.$transaction(async (tx) => {
    await tx.answerChoice.deleteMany({ where: { optionId } });
    await tx.questionOption.delete({ where: { id: optionId } });
    if (answered) {
      await tx.question.update({
        where: { id: option.questionId },
        data: { version: { increment: 1 } },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "QuestionOption",
        entityId: optionId,
        action: "question_option_removed",
        detail: {
          optionId,
          label: option.label,
          displayOrder: option.displayOrder,
          choices: choices.map((choice) => ({
            userId: choice.answer.userId,
            rank: choice.rank,
          })),
        },
      },
    });
  });
  revalidatePath(eventPath(event.workspaceId, option.question.eventId));
}
