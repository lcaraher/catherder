import { NextResponse } from "next/server";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { slotToDbTime, validateRanges } from "@/domain/availability";

export const dynamic = "force-dynamic";

interface AnswerInput {
  questionId: string;
  optionIds: string[];
  text: string;
  ranks: { optionId: string; rank: number }[];
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

// Submits a participant's response: copies the (event-editable) week into
// EventAvailability tagged with the standing version it was based on, stores
// answers against the questions' current versions, and marks the participant
// SUBMITTED — all in one transaction.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { questions: { include: { options: true } } },
  });
  if (!event) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
  });
  if (!participant) {
    return NextResponse.json({ error: "not a participant" }, { status: 403 });
  }
  if (event.status !== "OPEN") {
    return NextResponse.json(
      { error: "event is not open for responses" },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    ranges?: unknown;
    answers?: unknown;
  } | null;

  let ranges;
  try {
    ranges = validateRanges(body?.ranges);
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "invalid ranges",
    );
  }

  if (!Array.isArray(body?.answers)) {
    return badRequest("answers must be an array");
  }
  const answersById = new Map<string, AnswerInput>();
  for (const raw of body.answers as unknown[]) {
    const item = raw as Partial<AnswerInput> | null;
    if (typeof item?.questionId !== "string") {
      return badRequest("each answer needs a questionId");
    }
    answersById.set(item.questionId, {
      questionId: item.questionId,
      optionIds: Array.isArray(item.optionIds)
        ? item.optionIds.filter((id): id is string => typeof id === "string")
        : [],
      text: typeof item.text === "string" ? item.text : "",
      ranks: Array.isArray(item.ranks)
        ? item.ranks.filter(
            (r): r is { optionId: string; rank: number } =>
              typeof (r as { optionId?: unknown })?.optionId === "string" &&
              Number.isInteger((r as { rank?: unknown })?.rank),
          )
        : [],
    });
  }

  // Validate each question's answer against its type and current options.
  for (const question of event.questions) {
    const answer = answersById.get(question.id);
    if (!answer) {
      return badRequest(`missing answer for question "${question.prompt}"`);
    }
    const optionIds = new Set(question.options.map((option) => option.id));
    switch (question.type) {
      case "SINGLE_CHOICE": {
        if (
          answer.optionIds.length !== 1 ||
          !optionIds.has(answer.optionIds[0])
        ) {
          return badRequest(`choose one option for "${question.prompt}"`);
        }
        break;
      }
      case "MULTI_CHOICE": {
        if (answer.optionIds.some((id) => !optionIds.has(id))) {
          return badRequest(`unknown option for "${question.prompt}"`);
        }
        break;
      }
      case "TEXT": {
        break;
      }
      case "RANKING": {
        const rankedIds = answer.ranks.map((r) => r.optionId);
        const rankValues = answer.ranks.map((r) => r.rank);
        const complete =
          rankedIds.length === question.options.length &&
          new Set(rankedIds).size === rankedIds.length &&
          rankedIds.every((id) => optionIds.has(id)) &&
          new Set(rankValues).size === rankValues.length &&
          rankValues.every(
            (rank) => rank >= 1 && rank <= question.options.length,
          );
        if (!complete) {
          return badRequest(
            `rank every option exactly once for "${question.prompt}"`,
          );
        }
        break;
      }
    }
  }

  const standingVersion =
    (
      await prisma.standingAvailability.aggregate({
        where: { userId: user.id },
        _max: { version: true },
      })
    )._max.version ?? 0;

  await prisma.$transaction(async (tx) => {
    await tx.eventAvailability.deleteMany({
      where: { eventId, userId: user.id },
    });
    if (ranges.length > 0) {
      await tx.eventAvailability.createMany({
        data: ranges.map((range) => ({
          eventId,
          userId: user.id,
          weekday: range.weekday,
          startLocal: slotToDbTime(range.startSlot),
          endLocal: slotToDbTime(range.endSlot),
          status: range.status,
          copiedFromStandingVersion: standingVersion,
        })),
      });
    }

    for (const question of event.questions) {
      const input = answersById.get(question.id)!;
      const answer = await tx.answer.upsert({
        where: {
          questionId_userId: { questionId: question.id, userId: user.id },
        },
        update: { questionVersion: question.version },
        create: {
          questionId: question.id,
          questionVersion: question.version,
          eventId,
          userId: user.id,
        },
      });
      await tx.answerChoice.deleteMany({ where: { answerId: answer.id } });
      await tx.answerText.deleteMany({ where: { answerId: answer.id } });

      if (question.type === "SINGLE_CHOICE" || question.type === "MULTI_CHOICE") {
        if (input.optionIds.length > 0) {
          await tx.answerChoice.createMany({
            data: input.optionIds.map((optionId) => ({
              answerId: answer.id,
              optionId,
              rank: null,
            })),
          });
        }
      } else if (question.type === "RANKING") {
        await tx.answerChoice.createMany({
          data: input.ranks.map(({ optionId, rank }) => ({
            answerId: answer.id,
            optionId,
            rank,
          })),
        });
      } else {
        await tx.answerText.create({
          data: { answerId: answer.id, text: input.text },
        });
      }
    }

    await tx.eventParticipant.update({
      where: { eventId_userId: { eventId, userId: user.id } },
      data: { responseStatus: "SUBMITTED" },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: "submit",
      },
    });
  });

  return NextResponse.json({ ok: true });
}
