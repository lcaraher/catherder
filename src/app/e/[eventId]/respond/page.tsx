import { notFound } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { dbTimeToSlot, type AvailabilityRange } from "@/domain/availability";
import { RespondForm } from "@/components/respond-form";

export const dynamic = "force-dynamic";

export default async function RespondPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      questions: {
        orderBy: { displayOrder: "asc" },
        include: { options: { orderBy: { displayOrder: "asc" } } },
      },
    },
  });
  if (!event) notFound();

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
  });
  // Non-participants get a 404 rather than confirmation the event exists.
  if (!participant) notFound();

  if (event.status !== "OPEN") {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold">{event.name}</h1>
        <p className="text-sm text-zinc-500">
          This event is not currently open for responses.
        </p>
      </main>
    );
  }

  const toRanges = (
    rows: { weekday: number; startLocal: Date; endLocal: Date; status: "AVAILABLE" | "TENTATIVE" }[],
  ): AvailabilityRange[] =>
    rows.map((row) => ({
      weekday: row.weekday,
      startSlot: dbTimeToSlot(row.startLocal, "start"),
      endSlot: dbTimeToSlot(row.endLocal, "end"),
      status: row.status,
    }));

  // Prefill from a previous submission for this event if there is one,
  // otherwise from the user's standing week.
  const eventRows = await prisma.eventAvailability.findMany({
    where: { eventId, userId: user.id },
    orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
  });
  const standingRows = await prisma.standingAvailability.findMany({
    where: { userId: user.id },
    orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
  });
  const initialRanges = toRanges(eventRows.length > 0 ? eventRows : standingRows);

  const answers = await prisma.answer.findMany({
    where: { eventId, userId: user.id },
    include: { choices: true, text: true },
  });
  const initialAnswers = Object.fromEntries(
    answers.map((answer) => [
      answer.questionId,
      {
        optionIds: answer.choices.map((choice) => choice.optionId),
        text: answer.text?.text ?? "",
        ranks: Object.fromEntries(
          answer.choices
            .filter((choice) => choice.rank !== null)
            .map((choice) => [choice.optionId, choice.rank as number]),
        ),
      },
    ]),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">{event.name}</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Adjust your availability for this event (your standing week is
        pre-filled; changes here apply to this event only), then answer the
        questions below. Times are wall-clock in your time zone (
        {user.timeZone}).
      </p>
      <RespondForm
        eventId={eventId}
        initialRanges={initialRanges}
        questions={event.questions.map((question) => ({
          id: question.id,
          type: question.type,
          prompt: question.prompt,
          options: question.options.map((option) => ({
            id: option.id,
            label: option.label,
          })),
        }))}
        initialAnswers={initialAnswers}
        alreadySubmitted={participant.responseStatus === "SUBMITTED"}
      />
    </main>
  );
}
