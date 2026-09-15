import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { dbTimeToSlot, type AvailabilityRange } from "@/domain/availability";
import {
  canEditResponse,
  canViewOthersResponses,
} from "@/domain/response-access";
import {
  buildTimeZoneOptions,
  groupTimeZoneOptions,
} from "@/domain/time-zones";
import { ClockFormatPicker } from "@/components/clock-format-picker";
import { RespondForm } from "@/components/respond-form";
import { TimeZonePicker } from "@/components/time-zone-picker";
import { WeekGridDisplay } from "@/components/week-grid-display";

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
  // A non-participating organizer never responds; they manage availability
  // from the event page instead.
  if (participant.role === "ORGANIZER" && !event.organizerParticipates) {
    notFound();
  }

  const canEdit = canEditResponse({
    eventStatus: event.status,
    editUnlockedAt: participant.editUnlockedAt,
  });

  // The shared-results link only exists when this viewer could actually see
  // the responses page; the page re-checks the same rule server-side.
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: event.workspaceId, userId: user.id },
    },
  });
  const showResultsLink = canViewOthersResponses({
    viewerIsManager:
      event.organizerUserId === user.id ||
      membership?.role === "OWNER" ||
      membership?.role === "ORGANIZER",
    resultsRevealedAt: event.resultsRevealedAt,
  });
  const resultsLink = showResultsLink && (
    <p className="mb-4 text-sm">
      <Link href={`/e/${eventId}/responses`} className="underline">
        See shared results
      </Link>
    </p>
  );

  const toRanges = (
    rows: { weekday: number; startLocal: Date; endLocal: Date; status: "AVAILABLE" | "TENTATIVE" }[],
  ): AvailabilityRange[] =>
    rows.map((row) => ({
      weekday: row.weekday,
      startSlot: dbTimeToSlot(row.startLocal, "start"),
      endSlot: dbTimeToSlot(row.endLocal, "end"),
      status: row.status,
    }));

  const eventRows = await prisma.eventAvailability.findMany({
    where: { eventId, userId: user.id },
    orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
  });
  const answers = await prisma.answer.findMany({
    where: { eventId, userId: user.id },
    include: { choices: true, text: true },
  });

  if (!canEdit) {
    // A participant may always view their own submission (canViewOwnResponse),
    // so render it read-only with the reason editing is closed.
    const answersByQuestion = new Map(answers.map((a) => [a.questionId, a]));
    const hasSubmission =
      participant.responseStatus === "SUBMITTED" ||
      eventRows.length > 0 ||
      answers.length > 0;

    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-1 text-2xl font-semibold">{event.name}</h1>
        <p className="mb-6 rounded border border-edge bg-surface-muted px-3 py-2 text-sm text-muted">
          Editing is closed because this event is not open for responses. If
          you need to change your response, ask the organizer to unlock it for
          you.
        </p>
        {resultsLink}

        {!hasSubmission ? (
          <p className="text-sm text-hint">
            You have not submitted a response for this event.
          </p>
        ) : (
          <>
            <h2 className="mb-3 text-lg font-medium">Your availability</h2>
            <p className="mb-3 text-sm text-hint">
              Times are based in your time zone ({user.timeZone}).
            </p>
            <WeekGridDisplay
              ranges={toRanges(eventRows)}
              clockFormat={user.clockFormat}
            />

            {event.questions.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-3 text-lg font-medium">Your answers</h2>
                <ul className="flex flex-col gap-3">
                  {event.questions.map((question, index) => {
                    const answer = answersByQuestion.get(question.id);
                    const labelById = new Map(
                      question.options.map((o) => [o.id, o.label]),
                    );
                    let display = "—";
                    if (answer) {
                      if (question.type === "TEXT") {
                        display = answer.text?.text.trim() || "—";
                      } else if (question.type === "RANKING") {
                        const ranked = [...answer.choices]
                          .filter((c) => c.rank !== null)
                          .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
                          .map(
                            (c) =>
                              `${c.rank}. ${labelById.get(c.optionId) ?? "?"}`,
                          );
                        if (ranked.length > 0) display = ranked.join(", ");
                      } else {
                        const chosen = answer.choices
                          .map((c) => labelById.get(c.optionId))
                          .filter((label): label is string => Boolean(label));
                        if (chosen.length > 0) display = chosen.join(", ");
                      }
                    }
                    return (
                      <li
                        key={question.id}
                        className="rounded border border-edge p-4"
                      >
                        <p className="mb-2 text-sm font-medium">
                          {index + 1}. {question.prompt}
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-muted">
                          {display}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    );
  }

  // Prefill from a previous submission for this event if there is one,
  // otherwise from the user's standing week.
  const standingRows = await prisma.standingAvailability.findMany({
    where: { userId: user.id },
    orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
  });
  const initialRanges = toRanges(eventRows.length > 0 ? eventRows : standingRows);

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

  // Abbreviations and offsets are computed at render time so DST is right
  // for today; the client only filters this prepared list.
  const zoneGroups = groupTimeZoneOptions(
    buildTimeZoneOptions(Intl.supportedValuesOf("timeZone")),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">{event.name}</h1>
      <p className="mb-6 text-sm text-hint">
        Adjust your availability for this event (If your &lsquo;My
        Availability&rsquo; page is filled in, it will pre-fill those saved
        times here; changes here apply to this event only), then answer the
        questions below.
      </p>
      {resultsLink}
      <TimeZonePicker
        groups={zoneGroups}
        initialZoneId={user.timeZone}
        initialDismissedZone={user.dismissedDeviceZone}
        hint="Every hour in the grid below is read in this zone. It's your personal setting — if it isn't where you actually are, fix it before filling in your week."
      />
      <ClockFormatPicker initialFormat={user.clockFormat} />
      <RespondForm
        eventId={eventId}
        initialRanges={initialRanges}
        standingRanges={toRanges(standingRows)}
        questions={event.questions.map((question) => ({
          id: question.id,
          type: question.type,
          prompt: question.prompt,
          required: question.required,
          options: question.options.map((option) => ({
            id: option.id,
            label: option.label,
          })),
        }))}
        initialAnswers={initialAnswers}
        alreadySubmitted={participant.responseStatus === "SUBMITTED"}
        clockFormat={user.clockFormat}
      />
    </main>
  );
}
