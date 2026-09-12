import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import {
  addParticipant,
  addQuestion,
  addQuestionOption,
  removeParticipant,
  removeQuestionOption,
  reorderQuestion,
  setEventStatus,
  updateEvent,
  updateQuestionPrompt,
} from "../actions";

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
  DRAFT: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  OPEN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400",
  CLOSED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
};

const smallButton =
  "rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900";
const inputClass =
  "rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function GmBadge() {
  return (
    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
      GM
    </span>
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
  await requireRole(workspaceId, ["OWNER", "ORGANIZER"]);

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
        <Link href={`/w/${workspaceId}`} className="text-zinc-500 hover:underline">
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
      <p className="mb-4 text-sm text-zinc-500">
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

      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
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
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
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
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
            >
              Close event
            </button>
          </form>
        )}
        {event.status === "OPEN" && (
          <span className="text-sm text-zinc-500">
            Participants respond at{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
              /e/{event.id}/respond
            </code>
          </span>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Edit event</h2>
        <form
          action={updateEvent}
          className="flex flex-col gap-3 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
        >
          <input type="hidden" name="eventId" value={event.id} />
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label htmlFor="edit-name" className="mb-1 block text-zinc-600 dark:text-zinc-400">
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
                className="mb-1 block text-zinc-600 dark:text-zinc-400"
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
                className="mb-1 block text-zinc-600 dark:text-zinc-400"
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
                className="mb-1 block text-zinc-600 dark:text-zinc-400"
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
                  className="mb-1 block text-zinc-600 dark:text-zinc-400"
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
          <p className="text-xs text-zinc-500">
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
          <p className="mb-3 text-sm text-zinc-500">No participants yet.</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-1">
            {event.participants.map((participant) => (
              <li
                key={participant.userId}
                className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span className="flex items-center gap-2">
                  {participant.user.displayName}
                  {participant.role === "GAMEMASTER" ? (
                    <GmBadge />
                  ) : (
                    <span className="text-xs text-zinc-400">Player</span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span
                    className={`text-xs ${
                      participant.responseStatus === "SUBMITTED"
                        ? "text-emerald-600"
                        : "text-zinc-400"
                    }`}
                  >
                    {participant.responseStatus}
                  </span>
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
          <p className="mb-4 text-sm text-zinc-500">No questions yet.</p>
        ) : (
          <ul className="mb-6 flex flex-col gap-3">
            {event.questions.map((question, index) => (
              <li
                key={question.id}
                className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-400">
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
                {question._count.answers > 0 && (
                  <p className="mb-2 text-xs text-zinc-400">
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
