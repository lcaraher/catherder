import Link from "next/link";
import { notFound } from "next/navigation";
import { ForbiddenError, requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { canManageEvent, isAdminOverride } from "@/domain/event-access";
import {
  addParticipant,
  addQuestion,
  addQuestionOption,
  closeEventAndShareResults,
  removeParticipant,
  removeQuestionOption,
  reorderQuestion,
  setEventStatus,
  setParticipantEditLock,
  setQuestionAnswersRevealed,
  setResultsRevealed,
  updateEvent,
  updateQuestionPrompt,
} from "../actions";
import { GmBadge } from "@/components/gm-badge";

export const dynamic = "force-dynamic";

const MODE_LABELS = {
  GM_GROUPS: "GameMaster groups",
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

const smallButton =
  "rounded border border-edge-strong px-2 py-1 text-xs hover:bg-btn-secondary-hover disabled:opacity-40";
const inputClass =
  "rounded border border-edge-strong bg-field px-2 py-1 text-sm";

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
  params: Promise<{ workspaceId: string; eventId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { workspaceId, eventId } = await params;
  const { error } = await searchParams;

  // The event's GameMaster runs their own event, even with only PARTICIPANT
  // workspace membership; a workspace OWNER/ORGANIZER manages it as a visible
  // admin override. Every action re-checks on the server regardless.
  const user = await requireUser();
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  const viewerIsWorkspaceOrganizer =
    membership?.role === "OWNER" || membership?.role === "ORGANIZER";

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      gmUser: { select: { displayName: true } },
      participants: {
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { user: { displayName: "asc" } },
      },
      questions: {
        orderBy: { displayOrder: "asc" },
        include: {
          options: { orderBy: { displayOrder: "asc" } },
          _count: { select: { answers: true } },
        },
      },
    },
  });
  if (!event || event.workspaceId !== workspaceId) notFound();

  const access = {
    viewerUserId: user.id,
    gmUserId: event.gmUserId,
    viewerIsWorkspaceOrganizer,
  };
  if (!canManageEvent(access)) {
    throw new ForbiddenError(
      "must be the event's GameMaster or a workspace OWNER or ORGANIZER",
    );
  }
  const adminOverride = isAdminOverride(access);

  const participantIds = new Set(event.participants.map((p) => p.userId));
  const allMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: { user: { displayName: "asc" } },
  });
  // Existing participants (which always includes the GameMaster) are excluded.
  const addableMembers = allMembers.filter(
    (member) => !participantIds.has(member.userId),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="mb-2 text-sm">
        <Link href={`/w/${workspaceId}`} className="text-hint hover:underline">
          ← Events
        </Link>
      </p>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}
        >
          {event.status}
        </span>
      </div>
      <p className="mb-4 text-sm text-hint">
        {MODE_LABELS[event.mode]}
        {event.gmUser && (
          <>
            {" · GameMaster: "}
            <span className="font-medium">{event.gmUser.displayName}</span>{" "}
            <GmBadge />
          </>
        )}
        {` · target ${event.requiredSlots / 2}h`}
        {event.minGroupSize !== null && ` · min ${event.minGroupSize}`}
        {event.maxGroupSize !== null && ` · max ${event.maxGroupSize}`}
      </p>

      {adminOverride && event.gmUser && (
        <p className="mb-4 rounded border border-notice-admin-border bg-notice-admin px-3 py-2 text-sm text-notice-admin-text">
          This event is run by{" "}
          <span className="font-medium">{event.gmUser.displayName}</span> — you
          are acting as an admin.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
          {error}
        </p>
      )}

      <div className="mb-8 flex items-center gap-2">
        {event.status !== "OPEN" ? (
          <form action={setEventStatus}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="status" value="OPEN" />
            <button
              type="submit"
              className="rounded bg-btn-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-btn-primary-hover"
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
              className="rounded bg-btn-danger px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-btn-danger-hover"
            >
              Close event
            </button>
          </form>
        )}
        <Link
          href={`/e/${event.id}/responses`}
          className="rounded border border-edge-strong px-3 py-1.5 text-sm hover:bg-btn-secondary-hover"
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

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Results sharing</h2>
        <div className="flex flex-col gap-3 rounded border border-edge p-3 text-sm">
          <p className="text-muted">
            {event.resultsRevealedAt
              ? "Results are shared: participants can see everyone's responses."
              : "Results are hidden: responses, overlap and results are visible to organizers and the GameMaster only."}
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
                    className="rounded bg-btn-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-btn-primary-hover"
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
                  <button type="submit" className={smallButton}>
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
                <button type="submit" className={smallButton}>
                  {event.resultsRevealedAt
                    ? "Hide results again"
                    : "Share results with participants"}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Edit event</h2>
        <form
          action={updateEvent}
          className="flex flex-col gap-3 rounded border border-edge p-3 text-sm"
        >
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
            {event.mode === "GM_GROUPS" && (
              <div>
                <label
                  htmlFor="edit-gmUserId"
                  className="mb-1 block text-muted"
                >
                  GameMaster
                </label>
                <select
                  id="edit-gmUserId"
                  name="gmUserId"
                  defaultValue={event.gmUserId ?? ""}
                  className={inputClass}
                >
                  {allMembers.map((member) => (
                    <option key={member.user.id} value={member.user.id}>
                      {member.user.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-xs text-hint">
            Target session length is a starting point for grouping — you can
            change it later, and it does not limit what participants submit.
          </p>
          <div>
            <button type="submit" className={smallButton}>
              Save changes
            </button>
          </div>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Participants</h2>
        {event.participants.length === 0 ? (
          <p className="mb-3 text-sm text-hint">No participants yet.</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-1">
            {event.participants.map((participant) => (
              <li
                key={participant.userId}
                className="flex items-center justify-between rounded border border-edge px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  {participant.user.displayName}
                  {participant.role === "GAMEMASTER" ? (
                    <GmBadge />
                  ) : (
                    <span className="text-xs text-faint">Player</span>
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
                    {participant.responseStatus}
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
                          className={smallButton}
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
                          className={smallButton}
                        >
                          Unlock for editing
                        </button>
                      </form>
                    )
                  )}
                  {participant.userId !== event.gmUserId && (
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
                        className={smallButton}
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
        {addableMembers.length > 0 && (
          <form action={addParticipant} className="flex items-center gap-2 text-sm">
            <input type="hidden" name="eventId" value={event.id} />
            <select name="userId" className={inputClass}>
              {addableMembers.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.displayName}
                </option>
              ))}
            </select>
            <button type="submit" className={smallButton}>
              Add participant
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Questions</h2>
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
                    {TYPE_LABELS[question.type]} · v{question.version} ·{" "}
                    {question._count.answers} answer
                    {question._count.answers === 1 ? "" : "s"}
                  </span>
                  <span className="flex gap-1">
                    <form action={reorderQuestion}>
                      <input type="hidden" name="questionId" value={question.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={index === 0}
                        aria-label="Move question up"
                        className={smallButton}
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
                        className={smallButton}
                      >
                        ↓
                      </button>
                    </form>
                  </span>
                </div>
                <form
                  action={updateQuestionPrompt}
                  className="mb-2 flex items-center gap-2"
                >
                  <input type="hidden" name="questionId" value={question.id} />
                  <input
                    name="prompt"
                    defaultValue={question.prompt}
                    className={`flex-1 ${inputClass}`}
                  />
                  <button type="submit" className={smallButton}>
                    Save prompt
                  </button>
                </form>
                <form action={setQuestionAnswersRevealed} className="mb-2">
                  <input type="hidden" name="questionId" value={question.id} />
                  <input
                    type="hidden"
                    name="revealed"
                    value={question.answersRevealed ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    aria-pressed={question.answersRevealed}
                    title={
                      question.answersRevealed
                        ? "Participants can see everyone's answers to this question once results are shared. Click to hide them."
                        : "Participants cannot see answers to this question even once results are shared. Click to show them."
                    }
                    className={`${smallButton} inline-flex items-center gap-1.5`}
                  >
                    <EyeIcon open={question.answersRevealed} />
                    {question.answersRevealed
                      ? "Answers visible to participants"
                      : "Answers hidden from participants"}
                  </button>
                </form>
                {question._count.answers > 0 && (
                  <p className="mb-2 text-xs text-faint">
                    Answers exist — edits create version {question.version + 1}{" "}
                    instead of changing v{question.version}.
                  </p>
                )}
                {question.type !== "TEXT" && (
                  <div>
                    <ul className="mb-2 flex flex-col gap-1">
                      {question.options.map((option) => (
                        <li key={option.id} className="flex items-center gap-2">
                          <span className="flex-1">{option.label}</span>
                          {question._count.answers === 0 && (
                            <form action={removeQuestionOption}>
                              <input
                                type="hidden"
                                name="optionId"
                                value={option.id}
                              />
                              <button
                                type="submit"
                                aria-label={`Remove option ${option.label}`}
                                className={smallButton}
                              >
                                Remove
                              </button>
                            </form>
                          )}
                        </li>
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
                      <button type="submit" className={smallButton}>
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
          <select name="type" className={inputClass}>
            <option value="SINGLE_CHOICE">Single choice</option>
            <option value="MULTI_CHOICE">Multiple choice</option>
            <option value="TEXT">Text</option>
            <option value="RANKING">Ranking</option>
          </select>
          <input name="prompt" placeholder="Prompt" required className={inputClass} />
          <textarea
            name="options"
            rows={3}
            placeholder={"Options, one per line (not used for Text questions)"}
            className={inputClass}
          />
          <div>
            <button type="submit" className={smallButton}>
              Add question
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
