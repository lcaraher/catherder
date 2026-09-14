import { notFound } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { dbTimeToSlot, type AvailabilityRange } from "@/domain/availability";
import { canManageEvent, isAdminOverride } from "@/domain/event-access";
import { computeOverlapGrid, type OverlapParticipant } from "@/domain/overlap";
import {
  canViewOthersResponses,
  canViewQuestionAnswers,
} from "@/domain/response-access";
import { buildTimeZoneOptions } from "@/domain/time-zones";
import { GmBadge } from "@/components/gm-badge";
import { OverlapGridView } from "@/components/overlap-grid";

export const dynamic = "force-dynamic";

const th = "py-1 pr-4 text-xs font-medium text-muted";
const td = "border-t border-edge py-1.5 pr-4 align-top";

export default async function ResponsesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      gmUser: { select: { displayName: true, timeZone: true } },
      participants: {
        // displayName and timeZone only — email addresses never reach this page.
        include: {
          user: { select: { id: true, displayName: true, timeZone: true } },
        },
        orderBy: { user: { displayName: "asc" } },
      },
      questions: {
        orderBy: { displayOrder: "asc" },
        include: { options: { orderBy: { displayOrder: "asc" } } },
      },
    },
  });
  if (!event) notFound();

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: event.workspaceId, userId: user.id },
    },
  });
  const access = {
    viewerUserId: user.id,
    gmUserId: event.gmUserId,
    viewerIsWorkspaceOrganizer:
      membership?.role === "OWNER" || membership?.role === "ORGANIZER",
  };
  const viewerIsManager = canManageEvent(access);
  const viewerParticipates = event.participants.some(
    (participant) => participant.userId === user.id,
  );
  // Anyone else gets a 404 rather than confirmation the event exists.
  if (!viewerParticipates && !viewerIsManager) notFound();

  const canView = canViewOthersResponses({
    viewerIsOrganizerOrGm: viewerIsManager,
    resultsRevealedAt: event.resultsRevealedAt,
  });
  if (!canView) {
    // Deliberately bare: no names, no counts, nothing about the responses.
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold">{event.name}</h1>
        <p className="rounded border border-notice-warn-border bg-notice-warn px-3 py-2 text-sm text-notice-warn-text">
          Results have not been shared yet. The organizer will share them when
          response collection is done.
        </p>
      </main>
    );
  }

  const [availabilityRows, answers] = await Promise.all([
    prisma.eventAvailability.findMany({
      where: { eventId },
      orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
    }),
    prisma.answer.findMany({
      where: { eventId },
      include: { choices: true, text: true },
    }),
  ]);

  const rangesByUser = new Map<string, AvailabilityRange[]>();
  for (const row of availabilityRows) {
    const list = rangesByUser.get(row.userId) ?? [];
    list.push({
      weekday: row.weekday,
      startSlot: dbTimeToSlot(row.startLocal, "start"),
      endSlot: dbTimeToSlot(row.endLocal, "end"),
      status: row.status,
    });
    rangesByUser.set(row.userId, list);
  }

  // GM_GROUPS only: the GameMaster is not a participant (D-013) — their
  // EventParticipant row is storage only. They still feed the overlap grid
  // (as the anchor, split out client-side) and the selected-cell panel, but
  // never the participants table, question lists, or tallies. A single
  // activity's Organizer takes part like everyone else (D-014): no anchor,
  // no mark, counted in the numbers.
  const anchorGmUserId =
    event.mode === "GM_GROUPS" ? event.gmUserId : null;
  const players = event.participants.filter(
    (participant) => participant.role !== "GAMEMASTER",
  );
  const gmHasAvailability =
    anchorGmUserId !== null &&
    (rangesByUser.get(anchorGmUserId)?.length ?? 0) > 0;

  const people = event.participants.map((participant) => ({
    userId: participant.userId,
    displayName: participant.user.displayName,
    isGameMaster: participant.role === "GAMEMASTER",
    timeZone: participant.user.timeZone,
  }));
  const overlapInput: OverlapParticipant[] = people.map((person) => ({
    ...person,
    ranges: rangesByUser.get(person.userId) ?? [],
  }));
  const { grid, approximated, viewerApproximated } = computeOverlapGrid(
    overlapInput,
    user.timeZone,
  );
  const approximatedIds = new Set(approximated);
  const playerIds = new Set(players.map((participant) => participant.userId));

  // Latest answer save per user, shown as the submission time when present.
  const submittedAt = new Map<string, Date>();
  for (const answer of answers) {
    const seen = submittedAt.get(answer.userId);
    if (!seen || answer.updatedAt > seen) {
      submittedAt.set(answer.userId, answer.updatedAt);
    }
  }
  const submittedFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: user.timeZone,
    dateStyle: "medium",
    timeStyle: "short",
    hour12: user.clockFormat === "TWELVE_HOUR",
  });

  const answersByQuestion = new Map<string, Map<string, (typeof answers)[number]>>();
  for (const answer of answers) {
    const byUser = answersByQuestion.get(answer.questionId) ?? new Map();
    byUser.set(answer.userId, answer);
    answersByQuestion.set(answer.questionId, byUser);
  }

  const viewerZoneLabel =
    buildTimeZoneOptions([user.timeZone])[0]?.label ?? user.timeZone;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">{event.name}</h1>
      <p className="mb-4 text-sm text-hint">
        Times are shown in your time zone ({viewerZoneLabel})
        {viewerApproximated && " (shown to the nearest half hour)"}.
      </p>

      {isAdminOverride(access) && event.gmUser && (
        <p className="mb-4 rounded border border-notice-admin-border bg-notice-admin px-3 py-2 text-sm text-notice-admin-text">
          This event is organized by{" "}
          <span className="font-medium">{event.gmUser.displayName}</span> — you
          are acting as an admin.
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Participants</h2>
        {event.gmUser && (
          <p className="mb-3 flex items-center gap-2 text-sm">
            Organized by{" "}
            <span className="font-medium">{event.gmUser.displayName}</span>
            {event.mode === "GM_GROUPS" && (
              <>
                <GmBadge />
                <span className="text-muted">
                  — {event.gmUser.timeZone} —{" "}
                  {gmHasAvailability
                    ? "availability set for this event"
                    : "availability not set for this event"}
                </span>
              </>
            )}
          </p>
        )}
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Time zone</th>
              <th className={th}>Status</th>
              <th className={th}>Submitted</th>
              {viewerIsManager && <th className={th}>Note</th>}
            </tr>
          </thead>
          <tbody>
            {players.map((participant) => {
              const at =
                participant.responseStatus === "SUBMITTED"
                  ? submittedAt.get(participant.userId)
                  : undefined;
              return (
                <tr key={participant.userId}>
                  <td className={td}>{participant.user.displayName}</td>
                  <td className={`${td} text-muted`}>
                    {participant.user.timeZone}
                    {approximatedIds.has(participant.userId) &&
                      " (shown to the nearest half hour)"}
                  </td>
                  <td
                    className={`${td} text-xs ${
                      participant.responseStatus === "SUBMITTED"
                        ? "text-status-submitted"
                        : "text-status-invited"
                    }`}
                  >
                    {participant.responseStatus}
                  </td>
                  <td className={`${td} text-xs text-muted`}>
                    {at ? submittedFormat.format(at) : ""}
                  </td>
                  {viewerIsManager && (
                    <td className={`${td} text-xs text-muted whitespace-pre-wrap`}>
                      {participant.note ?? ""}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Overlap</h2>
        <p className="mb-3 text-xs text-hint">
          Each cell shows available · tentative. Select a cell to see who is
          in it.
        </p>
        <OverlapGridView
          grid={grid}
          people={people}
          gmUserId={anchorGmUserId}
          gmHasAvailability={gmHasAvailability}
          clockFormat={user.clockFormat}
        />
      </section>

      {event.questions.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Questions</h2>
          <div className="flex flex-col gap-4">
            {event.questions.map((question, index) => {
              const visible = canViewQuestionAnswers({
                viewerIsOrganizerOrGm: viewerIsManager,
                resultsRevealedAt: event.resultsRevealedAt,
                answersRevealed: question.answersRevealed,
              });
              const byUser =
                answersByQuestion.get(question.id) ??
                new Map<string, (typeof answers)[number]>();
              const labelById = new Map(
                question.options.map((option) => [option.id, option.label]),
              );

              return (
                <div
                  key={question.id}
                  className="rounded border border-edge p-4 text-sm"
                >
                  <p className="mb-3 font-medium">
                    {index + 1}. {question.prompt}
                  </p>

                  {!visible ? (
                    <p className="text-xs text-hint">
                      The organizer has not shared answers for this question.
                    </p>
                  ) : question.type === "TEXT" ? (
                    <ul className="flex flex-col gap-2">
                      {players.map((participant) => {
                        const text = byUser
                          .get(participant.userId)
                          ?.text?.text.trim();
                        return (
                          <li key={participant.userId}>
                            <span className="text-xs text-muted">
                              {participant.user.displayName}
                            </span>
                            {text ? (
                              <p className="whitespace-pre-wrap">{text}</p>
                            ) : (
                              <p className="text-hint">no answer</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr>
                            <th className={th}>Name</th>
                            <th className={th}>
                              {question.type === "RANKING"
                                ? "Ranked order"
                                : "Choice"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {players.map((participant) => {
                            const answer = byUser.get(participant.userId);
                            let display: string | null = null;
                            if (answer) {
                              if (question.type === "RANKING") {
                                const ranked = [...answer.choices]
                                  .filter((choice) => choice.rank !== null)
                                  .sort(
                                    (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
                                  )
                                  .map(
                                    (choice) =>
                                      `${choice.rank}. ${labelById.get(choice.optionId) ?? "?"}`,
                                  );
                                if (ranked.length > 0)
                                  display = ranked.join(", ");
                              } else {
                                const chosen = answer.choices
                                  .map((choice) =>
                                    labelById.get(choice.optionId),
                                  )
                                  .filter((label): label is string =>
                                    Boolean(label),
                                  );
                                if (chosen.length > 0)
                                  display = chosen.join(", ");
                              }
                            }
                            return (
                              <tr key={participant.userId}>
                                <td className={td}>
                                  {participant.user.displayName}
                                </td>
                                <td className={td}>
                                  {display ?? (
                                    <span className="text-hint">no answer</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <ul className="mt-3 flex flex-col gap-0.5 text-xs text-muted">
                        {question.type === "RANKING" && (
                          <li className="text-hint">
                            Summed rank per option — lower is better:
                          </li>
                        )}
                        {question.options.map((option) => {
                          // Tallies count players only — the GM's stored
                          // answers, if any, never feed them.
                          const playerAnswers = [...byUser.values()].filter(
                            (answer) => playerIds.has(answer.userId),
                          );
                          if (question.type === "RANKING") {
                            const entries = playerAnswers.flatMap((answer) =>
                              answer.choices.filter(
                                (choice) =>
                                  choice.optionId === option.id &&
                                  choice.rank !== null,
                              ),
                            );
                            const sum = entries.reduce(
                              (total, choice) => total + (choice.rank ?? 0),
                              0,
                            );
                            return (
                              <li key={option.id}>
                                {option.label} —{" "}
                                {entries.length > 0
                                  ? `${sum} (${entries.length} of ${players.length} ranked)`
                                  : "not ranked"}
                              </li>
                            );
                          }
                          const count = playerAnswers.filter((answer) =>
                            answer.choices.some(
                              (choice) => choice.optionId === option.id,
                            ),
                          ).length;
                          return (
                            <li key={option.id}>
                              {option.label} — {count}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
