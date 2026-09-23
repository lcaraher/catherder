import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppConfig } from "@/adapters/app-config";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { dbTimeToSlot } from "@/domain/availability";
import { canManageEvent, isAdminOverride } from "@/domain/event-access";
import { formatInviteCode } from "@/domain/invites";
import {
  addQuestion,
  addQuestionOption,
  archiveEvent,
  closeEventAndShareResults,
  createInvite,
  deleteQuestion,
  regenerateInvite,
  removeParticipant,
  removeQuestionOption,
  reorderQuestion,
  setEventStatus,
  setParticipantEditLock,
  setQuestionAllowOther,
  setQuestionAnswersRevealed,
  setQuestionRequired,
  setResultsRevealed,
  unarchiveEvent,
  updateEvent,
  updateEventDescription,
  updateQuestionOption,
  updateQuestionPrompt,
} from "./actions";
import { ArchiveEventForm } from "@/components/archive-event-form";
import { Segmented } from "@/components/segmented";
import { DANGER_SM, PRIMARY_SM, SECONDARY_SM } from "@/components/button-classes";
import { EventDescription } from "@/components/event-description";
import { EventDescriptionForm } from "@/components/event-description-form";
import { InvitePanel } from "@/components/invite-panel";
import { OrganizerAvailabilityEditor } from "@/components/organizer-availability-editor";
import { Checkbox, Select } from "@/components/form-controls";
import { OrganizerBadge } from "@/components/organizer-badge";
import { Pane } from "@/components/pane";
import { statusLabel } from "@/domain/status-label";
import { QuestionDeleteForm } from "@/components/question-delete-form";
import { QuestionOptionRow } from "@/components/question-option-row";
import { QuestionPromptForm } from "@/components/question-prompt-form";

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

const inputClass =
  "rounded border border-edge-strong bg-field px-2 py-1 text-sm";
// Select draws its own border and radius.
const selectClass = "px-2 py-1 text-sm";

// Line-drawn eye / crossed-out eye for the per-question answer visibility
// toggle. Stroke follows the button's text colour; no literal colours.
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" />
      <circle cx="8" cy="8" r="2" />
      {!open && <line x1="3" y1="13.5" x2="13" y2="2.5" />}
    </svg>
  );
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { eventId } = await params;
  const { error } = await searchParams;

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

      {error && (
        <p className="mb-4 rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
          {error}
        </p>
      )}

      <div className="mb-6 flex items-center gap-2">
        {event.status !== "OPEN" ? (
          <form action={setEventStatus}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="status" value="OPEN" />
            <button
              type="submit"
              className={PRIMARY_SM}
            >
              Open event
            </button>
          </form>
        ) : (
          <form action={setEventStatus}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="status" value="CLOSED" />
            <button
              type="submit"
              className={DANGER_SM}
            >
              Close event
            </button>
          </form>
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
            <code className="rounded bg-surface-raised px-1">
              /e/{event.id}/respond
            </code>
          </span>
        )}
      </div>

      <Pane className="mb-6">
        <h2 className="mb-3 border-b border-edge pb-2 text-lg font-medium">Invite people</h2>
        {event.invite ? (
          <InvitePanel
            eventId={event.id}
            joinUrl={`${getAppConfig().baseUrl}/join/${event.invite.code}`}
            code={formatInviteCode(event.invite.code)}
            regenerateAction={regenerateInvite}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded border border-edge p-3 text-sm">
            <form action={createInvite}>
              <input type="hidden" name="eventId" value={event.id} />
              <button type="submit" className={SECONDARY_SM}>
                Create invite
              </button>
            </form>
            <span className="text-xs text-hint">
              This event has no join link or code yet.
            </span>
          </div>
        )}
      </Pane>

      <Pane className="mb-6">
        <h2 className="mb-3 border-b border-edge pb-2 text-lg font-medium">Description</h2>
        <div className="flex flex-col gap-3 rounded border border-edge p-3">
          <EventDescriptionForm
            action={updateEventDescription}
            eventId={event.id}
            initialText={event.description ?? ""}
          />
          {event.description !== null && (
            <div className="border-t border-edge pt-3">
              <EventDescription text={event.description} />
            </div>
          )}
        </div>
      </Pane>

      <Pane className="mb-6">
        <h2 className="mb-3 border-b border-edge pb-2 text-lg font-medium">Results sharing</h2>
        <div className="flex flex-col gap-3 rounded border border-edge p-3 text-sm">
          <p className="text-muted">
            {event.resultsRevealedAt
              ? "Results are shared: participants can see everyone's responses."
              : "Results are hidden: responses, overlap and results are visible to the organizer only."}
          </p>
          {event.status === "OPEN" ? (
            <>
              <p className="text-muted">
                Participants can still change their responses while the event
                is open.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <form action={closeEventAndShareResults}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <button
                    type="submit"
                    className={PRIMARY_SM}
                  >
                    Close event and share results
                  </button>
                </form>
                <form action={setResultsRevealed}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input
                    type="hidden"
                    name="revealed"
                    value={event.resultsRevealedAt ? "false" : "true"}
                  />
                  <button type="submit" className={SECONDARY_SM}>
                    {event.resultsRevealedAt
                      ? "Hide results again"
                      : "Share now (participants can still edit)"}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div>
              <form action={setResultsRevealed}>
                <input type="hidden" name="eventId" value={event.id} />
                <input
                  type="hidden"
                  name="revealed"
                  value={event.resultsRevealedAt ? "false" : "true"}
                />
                <button type="submit" className={SECONDARY_SM}>
                  {event.resultsRevealedAt
                    ? "Hide results again"
                    : "Share results with participants"}
                </button>
              </form>
            </div>
          )}
        </div>
      </Pane>

      <Pane className="mb-6">
        <h2 className="mb-3 border-b border-edge pb-2 text-lg font-medium">Edit event</h2>
        <div className="flex flex-col gap-3 rounded border border-edge p-3 text-sm">
        <form action={updateEvent} className="flex flex-col gap-3">
          <input type="hidden" name="eventId" value={event.id} />
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label htmlFor="edit-name" className="mb-1 block text-muted">
                Name
              </label>
              <input
                id="edit-name"
                name="name"
                defaultValue={event.name}
                required
                className={`w-full ${inputClass}`}
              />
            </div>
            <div>
              <label
                htmlFor="edit-targetHours"
                className="mb-1 block text-muted"
              >
                Target session length (hours)
              </label>
              <input
                id="edit-targetHours"
                name="targetHours"
                type="number"
                min={0.5}
                step={0.5}
                defaultValue={event.requiredSlots / 2}
                required
                className={inputClass}
              />
            </div>
            {event.mode === "MULTI_GROUP" && (
              <>
                <div>
                  <label
                    htmlFor="edit-minGroupSize"
                    className="mb-1 block text-muted"
                  >
                    Min group size
                  </label>
                  <input
                    id="edit-minGroupSize"
                    name="minGroupSize"
                    type="number"
                    min={1}
                    defaultValue={event.minGroupSize ?? ""}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-maxGroupSize"
                    className="mb-1 block text-muted"
                  >
                    Max group size
                  </label>
                  <input
                    id="edit-maxGroupSize"
                    name="maxGroupSize"
                    type="number"
                    min={1}
                    defaultValue={event.maxGroupSize ?? ""}
                    className={inputClass}
                  />
                </div>
              </>
            )}
            <div>
              <label
                htmlFor="edit-organizerUserId"
                className="mb-1 block text-muted"
              >
                Organizer
              </label>
              {/* Options are this event's participants; updateEvent rejects
                  anyone else. */}
              <Select
                id="edit-organizerUserId"
                name="organizerUserId"
                defaultValue={event.organizerUserId}
                className={selectClass}
              >
                {event.participants.map((participant) => (
                  <option key={participant.userId} value={participant.userId}>
                    {participant.user.displayName}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-muted">
              <Checkbox
                name="organizerParticipates"
                defaultChecked={event.organizerParticipates}
              />
              Organizer also participates
            </label>
            <button
              type="button"
              aria-label="What does this do?"
              title="When on, the organizer takes part like any other member: they answer the questions and submit their availability for this event. When off, only their availability is used, and they are never asked to respond."
              className={SECONDARY_SM}
            >
              ?
            </button>
          </div>
          <p className="text-xs text-hint">
            Target session length is a starting point for grouping — you can
            change it later, and it does not limit what participants submit.
          </p>
          <div>
            <button type="submit" className={SECONDARY_SM}>
              Save changes
            </button>
          </div>
        </form>
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
              <form action={unarchiveEvent}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={SECONDARY_SM}>
                  Unarchive
                </button>
              </form>
              <span className="text-xs text-hint">
                This event is archived. Unarchive it to open or close it.
              </span>
            </>
          )}
        </div>
        </div>
      </Pane>

      <Pane className="mb-6">
        <h2 className="mb-3 border-b border-edge pb-2 text-lg font-medium">Participants</h2>
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
                <span className="flex items-center gap-3">
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
                      <form action={setParticipantEditLock}>
                        <input type="hidden" name="eventId" value={event.id} />
                        <input
                          type="hidden"
                          name="userId"
                          value={participant.userId}
                        />
                        <input type="hidden" name="unlocked" value="false" />
                        <button
                          type="submit"
                          aria-label={`Re-lock editing for ${participant.user.displayName}`}
                          className={SECONDARY_SM}
                        >
                          Re-lock
                        </button>
                      </form>
                    </>
                  ) : (
                    // Unlocking only does something while the event is
                    // CLOSED — OPEN is always editable, DRAFT never is.
                    event.status === "CLOSED" && (
                      <form action={setParticipantEditLock}>
                        <input type="hidden" name="eventId" value={event.id} />
                        <input
                          type="hidden"
                          name="userId"
                          value={participant.userId}
                        />
                        <input type="hidden" name="unlocked" value="true" />
                        <button
                          type="submit"
                          aria-label={`Unlock editing for ${participant.user.displayName}`}
                          className={SECONDARY_SM}
                        >
                          Unlock for editing
                        </button>
                      </form>
                    )
                  )}
                  {participant.userId !== event.organizerUserId && (
                    <form action={removeParticipant}>
                      <input type="hidden" name="eventId" value={event.id} />
                      <input
                        type="hidden"
                        name="userId"
                        value={participant.userId}
                      />
                      <button
                        type="submit"
                        aria-label={`Remove ${participant.user.displayName}`}
                        className={DANGER_SM}
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Pane>

      {viewerManagesOwnAvailability && (
        <Pane className="mb-6">
          <h2 className="mb-3 border-b border-edge pb-2 text-lg font-medium">
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
      )}

      <Pane>
        <h2 className="mb-3 border-b border-edge pb-2 text-lg font-medium">Questions</h2>
        {event.questions.length === 0 ? (
          <p className="mb-4 text-sm text-hint">No questions yet.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-hint">
              Answer visibility toggles only take effect once results are
              shared — until then participants see no answers at all.
            </p>
            <ul className="mb-6 flex flex-col gap-3">
            {event.questions.map((question, index) => (
              <li
                key={question.id}
                className="rounded border border-edge p-3 text-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-faint">
                    {TYPE_LABELS[question.type]} ·{" "}
                    {question._count.answers} answer
                    {question._count.answers === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    {!question.answersRevealed && (
                      <span className="rounded bg-badge-draft px-2 py-0.5 text-xs font-medium text-badge-draft-text">
                        Hidden
                      </span>
                    )}
                    {question.required && (
                      <span className="rounded bg-badge-open px-2 py-0.5 text-xs font-medium text-badge-open-text">
                        Required
                      </span>
                    )}
                    <form action={reorderQuestion}>
                      <input type="hidden" name="questionId" value={question.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={index === 0}
                        aria-label="Move question up"
                        className={SECONDARY_SM}
                      >
                        ↑
                      </button>
                    </form>
                    <form action={reorderQuestion}>
                      <input type="hidden" name="questionId" value={question.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={index === event.questions.length - 1}
                        aria-label="Move question down"
                        className={SECONDARY_SM}
                      >
                        ↓
                      </button>
                    </form>
                    <QuestionDeleteForm
                      action={deleteQuestion}
                      questionId={question.id}
                      answerCount={question._count.answers}
                    />
                  </span>
                </div>
                <QuestionPromptForm
                  action={updateQuestionPrompt}
                  questionId={question.id}
                  initialPrompt={question.prompt}
                  hasAnswers={question._count.answers > 0}
                />
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {/* The clicked segment carries the value; the action is a
                      no-op when it is already the current state. */}
                  <Segmented
                    label="Answer visibility"
                    size="sm"
                    action={setQuestionAnswersRevealed}
                    name="revealed"
                    value={String(question.answersRevealed)}
                    options={[
                      {
                        value: "false",
                        label: (
                          <>
                            <EyeIcon open={false} />
                            Hidden from participants
                          </>
                        ),
                        title:
                          "Participants cannot see answers to this question even once results are shared.",
                      },
                      {
                        value: "true",
                        label: (
                          <>
                            <EyeIcon open={true} />
                            Visible to participants
                          </>
                        ),
                        title:
                          "Participants can see everyone's answers to this question once results are shared.",
                      },
                    ]}
                  >
                    <input type="hidden" name="questionId" value={question.id} />
                  </Segmented>
                  <Segmented
                    label="Answer requirement"
                    size="sm"
                    action={setQuestionRequired}
                    name="required"
                    value={String(question.required)}
                    options={[
                      {
                        value: "false",
                        label: "Optional",
                        title: "Participants may leave this question unanswered.",
                      },
                      {
                        value: "true",
                        label: "Required",
                        title:
                          "Participants cannot submit a response without answering this question.",
                      },
                    ]}
                  >
                    <input type="hidden" name="questionId" value={question.id} />
                  </Segmented>
                  {(question.type === "SINGLE_CHOICE" ||
                    question.type === "MULTI_CHOICE") && (
                    <Segmented
                      label="Other answer"
                      size="sm"
                      action={setQuestionAllowOther}
                      name="allowOther"
                      value={String(question.allowOther)}
                      options={[
                        {
                          value: "false",
                          label: "No Other",
                          title: "Participants pick from the listed options only.",
                        },
                        {
                          value: "true",
                          label: "Allow Other",
                          title:
                            "Participants may pick Other and type their own short answer.",
                        },
                      ]}
                    >
                      <input
                        type="hidden"
                        name="questionId"
                        value={question.id}
                      />
                    </Segmented>
                  )}
                </div>
                {question.type !== "TEXT" && (
                  <div>
                    <ul className="mb-2 flex flex-col gap-1">
                      {question.options.map((option) => (
                        <QuestionOptionRow
                          key={option.id}
                          updateAction={updateQuestionOption}
                          removeAction={removeQuestionOption}
                          optionId={option.id}
                          initialLabel={option.label}
                          hasAnswers={question._count.answers > 0}
                          choiceCount={option._count.choices}
                        />
                      ))}
                    </ul>
                    <form
                      action={addQuestionOption}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="questionId" value={question.id} />
                      <input
                        name="label"
                        placeholder="New option"
                        className={`flex-1 ${inputClass}`}
                      />
                      <button type="submit" className={SECONDARY_SM}>
                        Add option
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
            </ul>
          </>
        )}

        <h3 className="mb-2 text-sm font-medium">Add a question</h3>
        <form action={addQuestion} className="flex flex-col gap-2 text-sm">
          <input type="hidden" name="eventId" value={event.id} />
          <Select name="type" className={selectClass}>
            <option value="SINGLE_CHOICE">Single choice</option>
            <option value="MULTI_CHOICE">Multiple choice</option>
            <option value="TEXT">Text</option>
            <option value="RANKING">Ranking</option>
          </Select>
          <input name="prompt" placeholder="Prompt" required className={inputClass} />
          <textarea
            name="options"
            rows={3}
            placeholder={"Options, one per line (not used for Text questions)"}
            className={inputClass}
          />
          <div>
            <button type="submit" className={SECONDARY_SM}>
              Add question
            </button>
          </div>
        </form>
      </Pane>
    </main>
  );
}
