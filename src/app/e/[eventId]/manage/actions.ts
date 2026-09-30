"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EventMode, QuestionType } from "@prisma/client";
import { ForbiddenError, requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { createInviteInTx, withFreshInviteCode } from "@/adapters/db/invites";
import { canManageEvent } from "@/domain/event-access";
import { EVENT_DESCRIPTION_MAX_LENGTH } from "@/domain/events";
import { SAVE_FAILED, saveError, saved, type SaveResult } from "@/domain/save-result";

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
  const allowed = canManageEvent({
    viewerUserId: user.id,
    organizerUserId: event.organizerUserId,
    viewerIsSiteAdmin: user.siteAdmin,
  });
  if (!allowed) {
    throw new ForbiddenError("not allowed to manage this event");
  }
  return { event, user };
}

const ARCHIVED_MESSAGE =
  "This event is archived. Unarchive it before opening or closing it.";
const NO_WORDING = "Add the question's wording.";
const NO_OPTION_TEXT = "Type the option before adding it.";

function eventPath(eventId: string): string {
  return `/e/${eventId}/manage`;
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
// parsed fields or the first validation error and the field it names.
function parseEventFields(
  formData: FormData,
): { fields: EventFields } | { error: string; field: string } {
  const name = String(formData.get("name") ?? "").trim();
  const targetHours = Number(String(formData.get("targetHours") ?? ""));
  // The form works in hours with 0.5 steps; storage is half-hour slots.
  const requiredSlots = Math.round(targetHours * 2);
  const minGroupSize = optionalSize(formData.get("minGroupSize"));
  const maxGroupSize = optionalSize(formData.get("maxGroupSize"));

  if (name === "") return { error: "Name is required.", field: "name" };
  if (
    !Number.isFinite(targetHours) ||
    requiredSlots < 1 ||
    Math.abs(targetHours * 2 - requiredSlots) > 1e-9
  ) {
    return {
      error:
        "Target session length must be at least half an hour, in half-hour steps.",
      field: "targetHours",
    };
  }
  for (const [field, size] of [
    ["minGroupSize", minGroupSize],
    ["maxGroupSize", maxGroupSize],
  ] as const) {
    if (size !== null && (!Number.isInteger(size) || size < 1)) {
      return { error: "Group sizes must be whole numbers of at least 1.", field };
    }
  }
  if (
    minGroupSize !== null &&
    maxGroupSize !== null &&
    minGroupSize > maxGroupSize
  ) {
    return {
      error: "Min group size cannot exceed max group size.",
      field: "minGroupSize",
    };
  }
  return { fields: { name, requiredSlots, minGroupSize, maxGroupSize } };
}

export async function createEvent(formData: FormData): Promise<SaveResult> {
  const user = await requireUser();

  const mode = String(formData.get("mode") ?? "") as EventMode;
  const organizerParticipates =
    String(formData.get("organizerParticipates") ?? "") === "on";

  const parsed = parseEventFields(formData);
  if ("error" in parsed) return saveError(parsed.error, parsed.field);
  if (!EVENT_MODES.includes(mode)) return saveError("Choose a mode.", "mode");

  // A fresh invite is issued with the event; a code collision retries the whole transaction.
  const event = await withFreshInviteCode((inviteCode) =>
    prisma.$transaction(async (tx) => {
      // The creator owns every event they create; single activity has no
      // groups, so its size bounds are always null whatever the form sent.
      const created = await tx.event.create({
        data: {
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

  // The marker lets the new event's page confirm the creation once.
  redirect(`${eventPath(event.id)}?created=1`);
}

// For events created before invites existed; a no-op once one exists.
export async function createInvite(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const { user } = await requireEventManager(eventId);
  const existing = await prisma.eventInvite.findUnique({ where: { eventId } });
  if (existing) return saved();

  await withFreshInviteCode((code) =>
    prisma.$transaction((tx) =>
      createInviteInTx(tx, { eventId, code, actorUserId: user.id }),
    ),
  );
  revalidatePath(eventPath(eventId));
  return saved();
}

// Replaces the code in place: the old link and code stop working at once.
export async function regenerateInvite(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const { user } = await requireEventManager(eventId);
  const invite = await prisma.eventInvite.findUnique({ where: { eventId } });
  if (!invite) return saveError(SAVE_FAILED);

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
  revalidatePath(eventPath(eventId));
  return saved();
}

export async function updateEvent(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  const organizerUserId =
    String(formData.get("organizerUserId") ?? "").trim() || null;
  const organizerParticipates =
    String(formData.get("organizerParticipates") ?? "") === "on";

  const parsed = parseEventFields(formData);
  if ("error" in parsed) return saveError(parsed.error, parsed.field);
  // The owner is reassignable in both modes, but only to someone already
  // on this event's roster.
  if (!organizerUserId) {
    return saveError("This event needs an Organizer.", "organizerUserId");
  }
  const ownerParticipant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId: organizerUserId } },
  });
  if (!ownerParticipant) {
    return saveError("The Organizer must already be on this event.", "organizerUserId");
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
      await tx.eventParticipant.updateMany({
        where: { eventId, userId: event.organizerUserId },
        data: { role: "PLAYER" },
      });
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
  revalidatePath(eventPath(eventId));
  return saved();
}

export async function updateEventDescription(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const text = String(formData.get("description") ?? "").trim();
  const { event, user } = await requireEventManager(eventId);

  if (text.length > EVENT_DESCRIPTION_MAX_LENGTH) {
    return saveError(
      `The description is limited to ${EVENT_DESCRIPTION_MAX_LENGTH} characters.`,
      "description",
    );
  }
  // Blank is stored as null so "no description" has one representation.
  const description = text === "" ? null : text;
  if (description === event.description) return saved();

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
  revalidatePath(eventPath(eventId));
  return saved();
}

export async function archiveEvent(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  if (event.archivedAt !== null) return saved();

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
  revalidatePath(eventPath(eventId));
  revalidatePath("/");
  return saved();
}

export async function unarchiveEvent(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  if (event.archivedAt === null) return saved();

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
  revalidatePath(eventPath(eventId));
  revalidatePath("/");
  return saved();
}

export async function setEventStatus(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "OPEN" && status !== "CLOSED") return saveError(SAVE_FAILED);
  const { event, user } = await requireEventManager(eventId);
  if (event.status === status) return saved();
  // An archived event stays as it is; unarchive it first.
  if (event.archivedAt !== null) {
    return saveError(ARCHIVED_MESSAGE);
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
  revalidatePath(eventPath(eventId));
  return saved();
}

export async function setResultsRevealed(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const revealed = String(formData.get("revealed") ?? "") === "true";
  const { event, user } = await requireEventManager(eventId);
  if ((event.resultsRevealedAt !== null) === revealed) return saved();

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
  revalidatePath(eventPath(eventId));
  return saved();
}

// Stops accepting responses and reveals results in one transaction.
export async function closeEventAndShareResults(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const { event, user } = await requireEventManager(eventId);
  if (event.status !== "OPEN") {
    const done = event.status === "CLOSED" && event.resultsRevealedAt !== null;
    return done ? saved() : saveError(SAVE_FAILED);
  }
  // An archived event stays as it is; unarchive it first.
  if (event.archivedAt !== null) {
    return saveError(ARCHIVED_MESSAGE);
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
  revalidatePath(eventPath(eventId));
  return saved();
}

export async function setParticipantEditLock(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const unlocked = String(formData.get("unlocked") ?? "") === "true";
  const { user } = await requireEventManager(eventId);

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  if (!participant) return saveError(SAVE_FAILED);
  if ((participant.editUnlockedAt !== null) === unlocked) return saved();

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
  revalidatePath(eventPath(eventId));
  return saved();
}

export async function removeParticipant(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const { event } = await requireEventManager(eventId);

  // The event's Organizer cannot be removed while they hold that role.
  if (userId === event.organizerUserId) return saveError(SAVE_FAILED);
  await prisma.eventParticipant.deleteMany({ where: { eventId, userId } });
  revalidatePath(eventPath(eventId));
  return saved();
}

export async function addQuestion(formData: FormData): Promise<SaveResult> {
  const eventId = String(formData.get("eventId") ?? "");
  const type = String(formData.get("type") ?? "") as QuestionType;
  const prompt = String(formData.get("prompt") ?? "").trim();
  // One field per option, named option-<n>, in the order shown; empty ones are skipped.
  const optionFields = [...formData.entries()]
    .filter(([name]) => /^option-\d+$/.test(name))
    .map(([name, value]) => ({ name, label: String(value).trim() }));
  const optionLines = optionFields.map((field) => field.label).filter((label) => label !== "");
  const firstEmpty = optionFields.find((field) => field.label === "")?.name;
  await requireEventManager(eventId);

  if (!QUESTION_TYPES.includes(type)) return saveError(SAVE_FAILED, "type");
  if (prompt === "") return saveError(NO_WORDING, "prompt");
  if (type === "RANKING" && optionLines.length < 2) {
    return saveError("A ranking needs at least two options.", firstEmpty);
  }
  if (type !== "TEXT" && optionLines.length === 0) {
    return saveError("Add at least one option.", firstEmpty);
  }

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
  revalidatePath(eventPath(eventId));
  return saved();
}

export async function reorderQuestion(formData: FormData): Promise<SaveResult> {
  const questionId = String(formData.get("questionId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") return saveError(SAVE_FAILED);
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question) return saveError(SAVE_FAILED);
  await requireEventManager(question.eventId);

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
  if (!neighbor) return saved();

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
  revalidatePath(eventPath(question.eventId));
  return saved();
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
  const { user } = await requireEventManager(question.eventId);

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
  revalidatePath(eventPath(question.eventId));
}

interface CardOption {
  /** The option's id, or a key the card made up for a new one. */
  key: string;
  id?: string;
  label: string;
  removed?: boolean;
}

interface CardChanges {
  questionId: string;
  prompt: string;
  answersRevealed: boolean;
  required: boolean;
  allowOther: boolean;
  options: CardOption[];
}

function parseCardChanges(value: FormDataEntryValue | null): CardChanges | null {
  try {
    const card = JSON.parse(String(value ?? "")) as CardChanges;
    if (typeof card.questionId !== "string" || typeof card.prompt !== "string") return null;
    if (!Array.isArray(card.options)) return null;
    return card;
  } catch {
    return null;
  }
}

// Saves a question card's whole set of changes in one transaction; the
// version goes up at most once per save.
export async function saveQuestionCard(formData: FormData): Promise<SaveResult> {
  const card = parseCardChanges(formData.get("card"));
  if (!card) return saveError(SAVE_FAILED);
  const question = await prisma.question.findUnique({
    where: { id: card.questionId },
    include: { options: { orderBy: { displayOrder: "asc" } } },
  });
  if (!question) return saveError(SAVE_FAILED);
  const { user } = await requireEventManager(question.eventId);

  const prompt = card.prompt.trim();
  if (prompt === "") return saveError(NO_WORDING, "prompt");

  const isChoice = question.type === "SINGLE_CHOICE" || question.type === "MULTI_CHOICE";
  const current = new Map(question.options.map((option) => [option.id, option]));
  const removed: string[] = [];
  const renamed: { id: string; from: string; to: string }[] = [];
  const added: string[] = [];
  if (question.type !== "TEXT") {
    let kept = 0;
    for (const option of card.options) {
      if (option.id !== undefined && !current.has(option.id)) return saveError(SAVE_FAILED);
      if (option.removed) {
        if (option.id !== undefined) removed.push(option.id);
        continue;
      }
      const label = String(option.label ?? "").trim();
      if (label === "") return saveError(NO_OPTION_TEXT, `option-${option.key}`);
      kept += 1;
      if (option.id === undefined) added.push(label);
      else if (label !== current.get(option.id)!.label) {
        renamed.push({ id: option.id, from: current.get(option.id)!.label, to: label });
      }
    }
    if (question.type === "RANKING" && kept < 2) {
      return saveError("A ranking needs at least two options.");
    }
    if (kept === 0) return saveError("Add at least one option.");
  }

  const promptChanged = prompt !== question.prompt;
  const revealedChanged = card.answersRevealed !== question.answersRevealed;
  const requiredChanged = card.required !== question.required;
  const otherChanged = isChoice && card.allowOther !== question.allowOther;
  const wordingChanged =
    promptChanged || removed.length > 0 || renamed.length > 0 || added.length > 0;
  if (!wordingChanged && !revealedChanged && !requiredChanged && !otherChanged) {
    return saved();
  }

  // Choices referencing a removed option are dropped with it; the audit row
  // records them so an administrator can restore by hand.
  const removedChoices = await prisma.answerChoice.findMany({
    where: { optionId: { in: removed } },
    include: { answer: { select: { userId: true } } },
  });
  const answered =
    (await prisma.answer.count({ where: { questionId: question.id } })) > 0;

  await prisma.$transaction(async (tx) => {
    for (const optionId of removed) {
      const option = current.get(optionId)!;
      await tx.answerChoice.deleteMany({ where: { optionId } });
      await tx.questionOption.delete({ where: { id: optionId } });
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
            choices: removedChoices
              .filter((choice) => choice.optionId === optionId)
              .map((choice) => ({ userId: choice.answer.userId, rank: choice.rank })),
          },
        },
      });
    }
    for (const { id, from, to } of renamed) {
      await tx.questionOption.update({ where: { id }, data: { label: to } });
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          entity: "QuestionOption",
          entityId: id,
          action: "question_option_edited",
          detail: { optionId: id, from, to },
        },
      });
    }
    let count = question.options.length - removed.length;
    for (const label of added) {
      await tx.questionOption.create({
        data: { questionId: question.id, label, displayOrder: count },
      });
      count += 1;
    }
    await tx.question.update({
      where: { id: question.id },
      data: {
        prompt,
        answersRevealed: card.answersRevealed,
        required: card.required,
        ...(isChoice ? { allowOther: card.allowOther } : {}),
        // Answer.questionVersion records which version each answer was for.
        ...(answered && wordingChanged ? { version: { increment: 1 } } : {}),
      },
    });
    const switchAudits = [
      revealedChanged &&
        (card.answersRevealed ? "question_answers_revealed" : "question_answers_hidden"),
      requiredChanged &&
        (card.required ? "question_required_set" : "question_required_cleared"),
      otherChanged &&
        (card.allowOther ? "question_allow_other_set" : "question_allow_other_cleared"),
    ].filter((action): action is string => Boolean(action));
    for (const action of switchAudits) {
      await tx.auditEvent.create({
        data: { actorUserId: user.id, entity: "Question", entityId: question.id, action },
      });
    }
  });
  revalidatePath(eventPath(question.eventId));
  return saved();
}
