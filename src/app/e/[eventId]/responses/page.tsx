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
import { ZoneChip } from "@/components/zone-chip";
import { HeatLegend } from "@/components/heat-legend";
import { OrganizerBadge } from "@/components/organizer-badge";
import { OverlapGridView } from "@/components/overlap-grid";
import { Pane } from "@/components/pane";
import { QuestionResults, td, th } from "@/components/question-results";
import { BlankTab } from "@/components/blank-tab";
import { WindowTabs } from "@/components/window-tabs";
import { statusLabel } from "@/domain/status-label";

export const dynamic = "force-dynamic";

const SUBMITTED_CLASS =
  "text-xs font-medium tabular-nums whitespace-nowrap text-muted";

export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { eventId } = await params;
  const { tab } = await searchParams;
  const user = await requireUser();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      organizerUser: { select: { displayName: true, timeZone: true } },
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

  const access = {
    viewerUserId: user.id,
    organizerUserId: event.organizerUserId,
    viewerIsSiteAdmin: user.siteAdmin,
  };
  const viewerIsManager = canManageEvent(access);
  const viewerParticipates = event.participants.some(
    (participant) => participant.userId === user.id,
  );
  // Anyone else gets a 404 rather than confirmation the event exists.
  if (!viewerParticipates && !viewerIsManager) notFound();

  const canView = canViewOthersResponses({
    viewerIsManager,
    resultsRevealedAt: event.resultsRevealedAt,
  });
  if (!canView) {
    // Deliberately bare: no names, no counts, nothing about the responses.
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Pane as="div" className="mb-6">
          <h1 className="text-2xl font-semibold">{event.name}</h1>
        </Pane>
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

  // A non-participating organizer feeds only the overlap grid and panel;
  // a participating one leads the respondents lists.
  const ownerRow = event.participants.find(
    (participant) => participant.role === "ORGANIZER",
  );
  const nonOwnerRows = event.participants.filter(
    (participant) => participant.role !== "ORGANIZER",
  );
  const respondents =
    event.organizerParticipates && ownerRow
      ? [ownerRow, ...nonOwnerRows]
      : nonOwnerRows;
  const organizerHasAvailability =
    (rangesByUser.get(event.organizerUserId)?.length ?? 0) > 0;

  const people = event.participants.map((participant) => ({
    userId: participant.userId,
    displayName: participant.user.displayName,
    isOrganizer: participant.role === "ORGANIZER",
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
  const gridPeople = people.map((person) => ({
    ...person,
    approximated: approximatedIds.has(person.userId),
  }));

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

  // One row per respondent, read by both the phone cards and the table.
  const respondentRows = respondents.map((participant) => {
    const at =
      participant.responseStatus === "SUBMITTED"
        ? submittedAt.get(participant.userId)
        : undefined;
    return {
      userId: participant.userId,
      name: participant.user.displayName,
      isOrganizer: participant.role === "ORGANIZER",
      timeZone: participant.user.timeZone,
      approximated: approximatedIds.has(participant.userId),
      status: statusLabel(participant.responseStatus),
      statusClass: `text-xs ${
        participant.responseStatus === "SUBMITTED"
          ? "text-status-submitted"
          : "text-status-invited"
      }`,
      submitted: at ? submittedFormat.format(at) : "",
    };
  });

  const answersByQuestion = new Map<string, Map<string, (typeof answers)[number]>>();
  for (const answer of answers) {
    const byUser = answersByQuestion.get(answer.questionId) ?? new Map();
    byUser.set(answer.userId, answer);
    answersByQuestion.set(answer.questionId, byUser);
  }

  const resultsRespondents = respondents.map((participant) => ({
    userId: participant.userId,
    displayName: participant.user.displayName,
    isOrganizer: participant.role === "ORGANIZER",
  }));

  const viewerZoneLabel =
    buildTimeZoneOptions([user.timeZone])[0]?.label ?? user.timeZone;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Pane as="div" className="mb-6">
      <h1 className="mb-1 text-2xl font-semibold">{event.name}</h1>
      <p className="text-sm font-medium text-hint">
        Times are shown in your time zone:{" "}
        <ZoneChip label={viewerZoneLabel} approximated={viewerApproximated} />
      </p>
      </Pane>

      {isAdminOverride(access) && (
        <p className="mb-4 rounded border border-notice-admin-border bg-notice-admin px-3 py-2 text-sm text-notice-admin-text">
          This event is organized by{" "}
          <span className="font-medium">
            {event.organizerUser.displayName}
          </span>{" "}
          — you are acting as an admin.
        </p>
      )}

      <WindowTabs
        label="Results sections"
        initialTab={tab}
        link={
          viewerIsManager
            ? { href: `/e/${eventId}/manage`, label: "Manage" }
            : undefined
        }
        tabs={[
          { id: "playdates", label: "Playdates" },
          { id: "participants", label: "Participants" },
          { id: "questions", label: "Questions", greyed: event.questions.length === 0 },
        ]}
        panels={{
          playdates: (
            <Pane>
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Playdates</h2>
              <HeatLegend
                counted={respondents.length}
                countOrganizer={event.organizerParticipates}
              />
              <OverlapGridView
                grid={grid}
                people={gridPeople}
                organizerUserId={event.organizerUserId}
                organizerHasAvailability={organizerHasAvailability}
                countOrganizer={event.organizerParticipates}
                submittedCount={
                  respondents.filter(
                    (participant) => participant.responseStatus === "SUBMITTED",
                  ).length
                }
                clockFormat={user.clockFormat}
              />
            </Pane>
          ),
          participants: (
            <Pane>
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Participants</h2>
              <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                Organized by{" "}
                <span className="font-medium">
                  {event.organizerUser.displayName}
                </span>
                <OrganizerBadge />
                {!event.organizerParticipates && (
                  <>
                    <ZoneChip
                      label={event.organizerUser.timeZone}
                      variant="person"
                      className="ml-1"
                    />
                    <span className="text-muted">
                      —{" "}
                      {organizerHasAvailability
                        ? "availability set for this event"
                        : "availability not set for this event"}
                    </span>
                  </>
                )}
              </p>
              <ul className="flex flex-col gap-2 sm:hidden">
                {respondentRows.map((row) => (
                  <li
                    key={row.userId}
                    className="flex flex-col gap-1 rounded border border-edge px-3 py-2.5"
                  >
                    <div>
                      <span className="font-medium break-words">{row.name}</span>
                      {row.isOrganizer && (
                        <OrganizerBadge className="ml-2 align-middle" />
                      )}
                      <ZoneChip
                        label={row.timeZone}
                        variant="person"
                        approximated={row.approximated}
                        className="ml-1"
                      />
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className={row.statusClass}>{row.status}</span>
                      <span className={SUBMITTED_CLASS}>{row.submitted}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <table className="hidden w-full text-left text-sm sm:table">
                <thead>
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {respondentRows.map((row) => (
                    <tr key={row.userId}>
                      <td className={td}>
                        <span className="break-words">{row.name}</span>
                        {row.isOrganizer && (
                          <OrganizerBadge className="ml-2 align-middle" />
                        )}
                        <ZoneChip
                          label={row.timeZone}
                          variant="person"
                          approximated={row.approximated}
                          className="ml-1"
                        />
                      </td>
                      <td className={`${td} ${row.statusClass}`}>{row.status}</td>
                      <td className={`${td} text-right ${SUBMITTED_CLASS}`}>
                        {row.submitted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Pane>
          ),
          questions:
            event.questions.length > 0 ? (
              <Pane>
                <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Questions</h2>
                <div className="flex flex-col gap-4">
                  {event.questions.map((question, index) => (
                    <QuestionResults
                      key={question.id}
                      index={index}
                      question={question}
                      respondents={resultsRespondents}
                      answers={[...(answersByQuestion.get(question.id)?.values() ?? [])]}
                      visible={canViewQuestionAnswers({
                        viewerIsManager,
                        resultsRevealedAt: event.resultsRevealedAt,
                        answersRevealed: question.answersRevealed,
                      })}
                    />
                  ))}
                </div>
              </Pane>
            ) : (
              <BlankTab
                heading="Questions"
                lines={[
                  "Looks like the organizer had no questions for anyone.",
                  "Hope they know what they're doing.",
                ]}
              />
            ),
        }}
      />
    </main>
  );
}
