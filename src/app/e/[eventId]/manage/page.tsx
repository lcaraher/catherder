import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppConfig } from "@/adapters/app-config";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { dbTimeToSlot } from "@/domain/availability";
import { canManageEvent, isAdminOverride } from "@/domain/event-access";
import { hasDescription } from "@/domain/events";
import { formatInviteCode } from "@/domain/invites";
import {
  addQuestion,
  archiveEvent,
  closeEventAndShareResults,
  createInvite,
  deleteQuestion,
  regenerateInvite,
  removeParticipant,
  reorderQuestion,
  saveQuestionCard,
  setEventStatus,
  setParticipantEditLock,
  setQuestionAnswersRevealed,
  setResultsRevealed,
  unarchiveEvent,
  updateEvent,
  updateEventDescription,
  updateEventShortDescription,
} from "./actions";
import { ActionForm, SaveConfirmations } from "@/components/save-form";
import { AddQuestionForm } from "@/components/add-question-form";
import { AnswerVisibility } from "@/components/answer-visibility";
import { ArchiveEventForm } from "@/components/archive-event-form";
import { CreatedNote } from "@/components/created-note";
import { EditEventForm } from "@/components/edit-event-form";
import { DANGER_SM, PRIMARY_GO_SM, PRIMARY_SM, SECONDARY_SM } from "@/components/button-classes";
import { EventDescriptionForm } from "@/components/event-description-form";
import { InvitePanel } from "@/components/invite-panel";
import { OrganizerAvailabilityEditor } from "@/components/organizer-availability-editor";
import { OrganizerBadge } from "@/components/organizer-badge";
import { Pane } from "@/components/pane";
import { ShortDescriptionForm } from "@/components/short-description-form";
import { statusLabel } from "@/domain/status-label";
import { QuestionDeleteForm } from "@/components/question-delete-form";
import { QuestionCard } from "@/components/question-card";
import { QuestionResults } from "@/components/question-results";
import { WindowTabs } from "@/components/window-tabs";

export const dynamic = "force-dynamic";

const MODE_LABELS = {
  MULTI_GROUP: "Multi-group activity",
  SINGLE_ACTIVITY: "Single activity",
} as const;

const TYPE_LABELS = {
  SINGLE_CHOICE: "Single choice",
  MULTI_CHOICE: "Multiple choice",
  TEXT: "Text",
  RANKING: "Ranking",
} as const;

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-badge-draft text-badge-draft-text",
  OPEN: "bg-badge-open text-badge-open-text",
  CLOSED: "bg-badge-closed text-badge-closed-text",
};

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ created?: string; tab?: string | string[] }>;
}) {
  const { eventId } = await params;
  const { created, tab } = await searchParams;

  const user = await requireUser();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      organizerUser: { select: { displayName: true } },
      invite: { select: { code: true } },
      participants: {
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { user: { displayName: "asc" } },
      },
      questions: {
        orderBy: { displayOrder: "asc" },
        include: {
          options: {
            orderBy: { displayOrder: "asc" },
            include: { _count: { select: { choices: true } } },
          },
          _count: { select: { answers: true } },
        },
      },
    },
  });
  if (!event) notFound();

  const access = {
    viewerUserId: user.id,
    organizerUserId: event.organizerUserId,
    viewerIsSiteAdmin: user.siteAdmin,
  };
  // Anyone who cannot manage the event gets the same 404 as a missing one.
  if (!canManageEvent(access)) notFound();
  const adminOverride = isAdminOverride(access);

  // A non-participating organizer's row never renders in the roster; a
  // participating one leads it.
  const ownerRow = event.participants.find(
    (participant) => participant.role === "ORGANIZER",
  );
  const nonOwnerRows = event.participants.filter(
    (participant) => participant.role !== "ORGANIZER",
  );
  const rosterRows =
    event.organizerParticipates && ownerRow
      ? [ownerRow, ...nonOwnerRows]
      : nonOwnerRows;

  // Submitted participants; the organizer only when they take part.
  const respondedCount = event.participants.filter(
    (participant) =>
      participant.responseStatus === "SUBMITTED" &&
      (event.organizerParticipates || participant.role !== "ORGANIZER"),
  ).length;

  const answers = await prisma.answer.findMany({
    where: { eventId },
    include: { choices: true, text: true },
  });
  const resultsRespondents = rosterRows.map((participant) => ({
    userId: participant.userId,
    displayName: participant.user.displayName,
    isOrganizer: participant.role === "ORGANIZER",
  }));

  // The organizer edits their own event availability here — never an admin
  // override, never when they participate (they respond instead).
  const viewerManagesOwnAvailability =
    event.organizerUserId === user.id &&
    !event.organizerParticipates;
  const toRanges = (
    rows: {
      weekday: number;
      startLocal: Date;
      endLocal: Date;
      status: "AVAILABLE" | "TENTATIVE";
    }[],
  ) =>
    rows.map((row) => ({
      weekday: row.weekday,
      startSlot: dbTimeToSlot(row.startLocal, "start"),
      endSlot: dbTimeToSlot(row.endLocal, "end"),
      status: row.status,
    }));
  const [organizerAvailabilityRows, organizerStandingRows] =
    viewerManagesOwnAvailability
      ? await Promise.all([
          prisma.eventAvailability.findMany({
            where: { eventId, userId: user.id },
            orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
          }),
          prisma.standingAvailability.findMany({
            where: { userId: user.id },
            orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
          }),
        ])
      : [[], []];
  const organizerAvailabilityRanges = toRanges(organizerAvailabilityRows);
  const organizerStandingRanges = toRanges(organizerStandingRows);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <SaveConfirmations>
      <Pane as="div" className="mb-6">
      <p className="mb-2 text-sm">
        <Link href="/" className="text-hint">
          ← Events
        </Link>
      </p>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}
        >
          {statusLabel(event.status)}
        </span>
        {event.archivedAt !== null && (
          <span className="rounded bg-badge-draft px-2 py-0.5 text-xs font-medium text-badge-draft-text">
            {statusLabel("ARCHIVED")}
          </span>
        )}
        {created !== undefined && <CreatedNote />}
      </div>
      <p className="text-sm font-medium text-hint">
        {MODE_LABELS[event.mode]}
        {" · Organizer: "}
        <span className="font-medium">{event.organizerUser.displayName}</span>{" "}
        <OrganizerBadge />
        {` · target ${event.requiredSlots / 2}h`}
        {event.minGroupSize !== null && ` · min ${event.minGroupSize}`}
        {event.maxGroupSize !== null && ` · max ${event.maxGroupSize}`}
      </p>
      </Pane>

      {adminOverride && (
        <p className="mb-4 rounded border border-notice-admin-border bg-notice-admin px-3 py-2 text-sm text-notice-admin-text">
          This event is organized by{" "}
          <span className="font-medium">
            {event.organizerUser.displayName}
          </span>
          . Changes you make here are made to their event.
        </p>
      )}

      <div className="mb-6 flex items-start gap-2">
        {event.status !== "OPEN" ? (
          <ActionForm
            action={setEventStatus}
            label="Open event"
            buttonClassName={PRIMARY_GO_SM}
            confirmKey="event-status"
            confirms={{ "event-status": "Event opened" }}
            confirmText="Event closed"
          >
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="status" value="OPEN" />
          </ActionForm>
        ) : (
          <ActionForm
            action={setEventStatus}
            label="Close event"
            buttonClassName={DANGER_SM}
            confirmKey="event-status"
            confirms={{ "event-status": "Event closed" }}
            confirmText="Event opened"
          >
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="status" value="CLOSED" />
          </ActionForm>
        )}
        <Link
          href={`/e/${event.id}/responses`}
          className={`${SECONDARY_SM} no-underline`}
        >
          View responses
        </Link>
        {event.status === "OPEN" && (
          <span className="text-sm text-hint">
            Participants respond at{" "}
            <code className="rounded bg-surface-raised px-1 break-all">
              /e/{event.id}/respond
            </code>
          </span>
        )}
      </div>

      <WindowTabs
        label="Event sections"
        initialTab={tab}
        tabs={[
          { id: "description", label: "Description" },
          ...(viewerManagesOwnAvailability
            ? [{ id: "availability", label: "Availability" }]
            : []),
          { id: "participants", label: "Participants" },
          { id: "questions", label: "Questions" },
          { id: "settings", label: "Settings" },
          { id: "results", label: "Results" },
        ]}
        panels={{
          description: (
            <>
              <Pane className="mb-6">
                <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Invite people</h2>
                {event.status === "DRAFT" && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border border-notice-warn-border bg-notice-warn px-3 py-2 text-sm text-notice-warn-text">
                    The link and code start working when the event opens.
                    <ActionForm
                      action={setEventStatus}
                      label="Open event"
                      buttonClassName={PRIMARY_GO_SM}
                      confirmKey="event-status"
                      confirms={{ "event-status": "Event opened" }}
                      confirmText="Event closed"
                    >
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="status" value="OPEN" />
                    </ActionForm>
                  </div>
                )}
                {event.invite ? (
                  <InvitePanel
                    eventId={event.id}
                    joinUrl={`${getAppConfig().baseUrl}/join/${event.invite.code}`}
                    code={formatInviteCode(event.invite.code)}
                    regenerateAction={regenerateInvite}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-3 rounded border border-edge p-3 text-sm">
                    <ActionForm
                      action={createInvite}
                      label="Create invite"
                      buttonClassName={SECONDARY_SM}
                    >
                      <input type="hidden" name="eventId" value={event.id} />
                    </ActionForm>
                    <span className="text-xs text-hint">
                      This event has no join link or code yet.
                    </span>
                  </div>
                )}
              </Pane>

              <Pane className="mb-6">
                <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Short description</h2>
                <div className="unsaved-frame flex flex-col gap-3 rounded border border-edge p-3">
                  <ShortDescriptionForm
                    action={updateEventShortDescription}
                    eventId={event.id}
                    eventName={event.name}
                    hasDescription={hasDescription(event.description)}
                    hasQuestions={event.questions.length > 0}
                    initialText={event.shortDescription ?? ""}
                  />
                </div>
              </Pane>

              <Pane>
                <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Description</h2>
                <div className="unsaved-frame flex flex-col gap-3 rounded border border-edge p-3">
                  <EventDescriptionForm
                    action={updateEventDescription}
                    eventId={event.id}
                    initialText={event.description ?? ""}
                  />
                </div>
              </Pane>
            </>
          ),
          availability: viewerManagesOwnAvailability && (
            <Pane className="unsaved-frame">
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">
                Your availability for this event
              </h2>
              {organizerAvailabilityRanges.length === 0 && (
                <p className="mb-3 text-sm text-muted">
                  Participants are matched against your availability. Set it
                  here, or leave it empty to see everyone&rsquo;s overlap on its
                  own.
                </p>
              )}
              <OrganizerAvailabilityEditor
                eventId={event.id}
                initialRanges={organizerAvailabilityRanges}
                standingRanges={organizerStandingRanges}
                clockFormat={user.clockFormat}
              />
            </Pane>
          ),
          participants: (
            <Pane>
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Participants</h2>
              {!event.organizerParticipates && (
                <p className="mb-3 flex items-center gap-2 text-sm">
                  Organized by{" "}
                  <span className="font-medium">
                    {event.organizerUser.displayName}
                  </span>
                  <OrganizerBadge />
                </p>
              )}
              {rosterRows.length === 0 ? (
                <p className="mb-3 text-sm text-hint">No participants yet.</p>
              ) : (
                <ul className="mb-3 flex flex-col gap-1">
                  {rosterRows.map((participant) => (
                    <li
                      key={participant.userId}
                      className="flex items-start justify-between gap-3 rounded border border-edge px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="break-words">
                          {participant.user.displayName}
                        </span>
                        {participant.role === "ORGANIZER" ? (
                          <OrganizerBadge className="ml-2 align-middle" />
                        ) : (
                          <span className="ml-2 align-middle text-xs text-faint">
                            Player
                          </span>
                        )}
                      </span>
                      <span className="flex items-start gap-3">
                        <span
                          className={`text-xs ${
                            participant.responseStatus === "SUBMITTED"
                              ? "text-status-submitted"
                              : "text-status-invited"
                          }`}
                        >
                          {statusLabel(participant.responseStatus)}
                        </span>
                        {participant.editUnlockedAt ? (
                          // A stale unlock must always be clearable, whatever the
                          // event status.
                          <>
                            <span className="text-xs text-status-unlocked">
                              Unlocked for editing
                            </span>
                            <ActionForm
                              action={setParticipantEditLock}
                              label="Re-lock"
                              buttonClassName={SECONDARY_SM}
                              buttonProps={{
                                "aria-label": `Re-lock editing for ${participant.user.displayName}`,
                              }}
                              confirmKey={`lock-${participant.userId}`}
                              confirms={{ [`lock-${participant.userId}`]: "Saved" }}
                            >
                              <input type="hidden" name="eventId" value={event.id} />
                              <input
                                type="hidden"
                                name="userId"
                                value={participant.userId}
                              />
                              <input type="hidden" name="unlocked" value="false" />
                            </ActionForm>
                          </>
                        ) : (
                          // Unlocking only does something while the event is
                          // CLOSED — OPEN is always editable, DRAFT never is.
                          event.status === "CLOSED" && (
                            <ActionForm
                              action={setParticipantEditLock}
                              label="Unlock for editing"
                              buttonClassName={SECONDARY_SM}
                              buttonProps={{
                                "aria-label": `Unlock editing for ${participant.user.displayName}`,
                              }}
                              confirmKey={`lock-${participant.userId}`}
                              confirms={{ [`lock-${participant.userId}`]: "Saved" }}
                            >
                              <input type="hidden" name="eventId" value={event.id} />
                              <input
                                type="hidden"
                                name="userId"
                                value={participant.userId}
                              />
                              <input type="hidden" name="unlocked" value="true" />
                            </ActionForm>
                          )
                        )}
                        {participant.userId !== event.organizerUserId && (
                          <ActionForm
                            action={removeParticipant}
                            label="Remove"
                            buttonClassName={DANGER_SM}
                            plain
                            buttonProps={{
                              "aria-label": `Remove ${participant.user.displayName}`,
                            }}
                          >
                            <input type="hidden" name="eventId" value={event.id} />
                            <input
                              type="hidden"
                              name="userId"
                              value={participant.userId}
                            />
                          </ActionForm>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Pane>
          ),
          questions: (
            <Pane>
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Questions</h2>
              {event.questions.length === 0 ? (
                <p className="mb-4 text-sm text-hint">No questions yet.</p>
              ) : (
                <ul className="mb-6 flex flex-col gap-3">
                  {event.questions.map((question, index) => (
                    <QuestionCard
                      key={question.id}
                      action={saveQuestionCard}
                      question={{
                        id: question.id,
                        type: question.type,
                        prompt: question.prompt,
                        required: question.required,
                        allowOther: question.allowOther,
                        answerCount: question._count.answers,
                        options: question.options.map((option) => ({
                          id: option.id,
                          label: option.label,
                          choiceCount: option._count.choices,
                        })),
                      }}
                      header={
                            <div key="header" className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-xs text-faint">
                                {TYPE_LABELS[question.type]} ·{" "}
                                {question._count.answers} answer
                                {question._count.answers === 1 ? "" : "s"}
                              </span>
                              <span className="flex items-start gap-1">
                                {question.required && (
                                  <span className="rounded bg-badge-open px-2 py-0.5 text-xs font-medium text-badge-open-text">
                                    Required
                                  </span>
                                )}
                                <ActionForm
                                  action={reorderQuestion}
                                  tickOnly
                                  label="↑"
                                  buttonClassName={SECONDARY_SM}
                                  buttonProps={{
                                    disabled: index === 0,
                                    "aria-label": "Move question up",
                                  }}
                                >
                                  <input type="hidden" name="questionId" value={question.id} />
                                  <input type="hidden" name="direction" value="up" />
                                </ActionForm>
                                <ActionForm
                                  action={reorderQuestion}
                                  tickOnly
                                  label="↓"
                                  buttonClassName={SECONDARY_SM}
                                  buttonProps={{
                                    disabled: index === event.questions.length - 1,
                                    "aria-label": "Move question down",
                                  }}
                                >
                                  <input type="hidden" name="questionId" value={question.id} />
                                  <input type="hidden" name="direction" value="down" />
                                </ActionForm>
                                <QuestionDeleteForm
                                  action={deleteQuestion}
                                  questionId={question.id}
                                  answerCount={question._count.answers}
                                />
                              </span>
                            </div>
                      }
                    />
                  ))}
                </ul>
              )}

              <h3 className="mb-2 text-sm font-semibold">Add a question</h3>
              <AddQuestionForm
                action={addQuestion}
                eventId={event.id}
                respondedCount={respondedCount}
              />
            </Pane>
          ),
          settings: (
            <Pane>
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Edit event</h2>
              <div className="unsaved-frame flex flex-col gap-3 rounded border border-edge p-3 text-sm">
              <EditEventForm
                action={updateEvent}
                event={{
                  id: event.id,
                  name: event.name,
                  mode: event.mode,
                  requiredSlots: event.requiredSlots,
                  minGroupSize: event.minGroupSize,
                  maxGroupSize: event.maxGroupSize,
                  organizerUserId: event.organizerUserId,
                  organizerParticipates: event.organizerParticipates,
                }}
                participants={event.participants.map((participant) => ({
                  userId: participant.userId,
                  displayName: participant.user.displayName,
                }))}
              />
              {/* Archiving lives outside the edit form: forms cannot nest. */}
              <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-3">
                {event.archivedAt === null ? (
                  <>
                    <ArchiveEventForm action={archiveEvent} eventId={event.id} />
                    <span className="text-xs text-hint">
                      Archived events leave everyone&rsquo;s lists and cannot be
                      edited or responded to.
                    </span>
                  </>
                ) : (
                  <>
                    <ActionForm
                      action={unarchiveEvent}
                      label="Unarchive"
                      buttonClassName={SECONDARY_SM}
                      confirmKey="archive"
                      confirms={{ archive: "Event unarchived" }}
                      confirmText="Event archived"
                    >
                      <input type="hidden" name="eventId" value={event.id} />
                    </ActionForm>
                    <span className="text-xs text-hint">
                      This event is archived. Unarchive it to open or close it.
                    </span>
                  </>
                )}
              </div>
              </div>
            </Pane>
          ),
          results: (
            <Pane>
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Results</h2>
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-edge px-3 py-2 text-sm">
                <span className="mr-auto text-muted">
                  {event.resultsRevealedAt ? "Shared with participants" : "Hidden from participants"}
                </span>
                {event.status === "OPEN" ? (
                  <>
                    <ActionForm
                      action={closeEventAndShareResults}
                      label="Close event and share results"
                      buttonClassName={PRIMARY_SM}
                      confirms={{
                        "event-status": "Event closed",
                        results: "Results shared",
                      }}
                    >
                      <input type="hidden" name="eventId" value={event.id} />
                    </ActionForm>
                    <ActionForm
                      action={setResultsRevealed}
                      label={
                        event.resultsRevealedAt
                          ? "Hide results again"
                          : "Share now (participants can still edit)"
                      }
                      buttonClassName={SECONDARY_SM}
                      confirmKey="results"
                      confirms={{
                        results: event.resultsRevealedAt ? "Results hidden" : "Results shared",
                      }}
                      confirmText={event.resultsRevealedAt ? "Results shared" : "Results hidden"}
                    >
                      <input type="hidden" name="eventId" value={event.id} />
                      <input
                        type="hidden"
                        name="revealed"
                        value={event.resultsRevealedAt ? "false" : "true"}
                      />
                    </ActionForm>
                  </>
                ) : (
                  <ActionForm
                    action={setResultsRevealed}
                    label={
                      event.resultsRevealedAt
                        ? "Hide results again"
                        : "Share results with participants"
                    }
                    buttonClassName={SECONDARY_SM}
                    confirmKey="results"
                    confirms={{
                      results: event.resultsRevealedAt ? "Results hidden" : "Results shared",
                    }}
                    confirmText={event.resultsRevealedAt ? "Results shared" : "Results hidden"}
                  >
                    <input type="hidden" name="eventId" value={event.id} />
                    <input
                      type="hidden"
                      name="revealed"
                      value={event.resultsRevealedAt ? "false" : "true"}
                    />
                  </ActionForm>
                )}
              </div>
              {event.questions.length > 0 ? (
                <>
                  <p className="mb-3 text-xs text-hint">
                    Answer visibility toggles only take effect once results are
                    shared — until then participants see no answers at all.
                  </p>
                  <div className="flex flex-col gap-4">
                    {event.questions.map((question, index) => (
                      <QuestionResults
                        key={question.id}
                        index={index}
                        question={question}
                        respondents={resultsRespondents}
                        answers={answers.filter((answer) => answer.questionId === question.id)}
                        visible={true}
                        control={
                          <AnswerVisibility
                            action={setQuestionAnswersRevealed}
                            questionId={question.id}
                            revealed={question.answersRevealed}
                          />
                        }
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-hint">No questions yet.</p>
              )}
            </Pane>
          ),
        }}
      />
      </SaveConfirmations>
    </main>
  );
}
