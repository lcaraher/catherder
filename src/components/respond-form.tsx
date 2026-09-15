"use client";

import { useRef, useState } from "react";
import {
  cellsToRanges,
  weekFromRanges,
  weeksEqual,
  weekToCells,
  type AvailabilityRange,
  type ClockFormat,
} from "@/domain/availability";
import { WeekGridEditor } from "@/components/week-grid-editor";
import { useWeekGrid } from "@/components/use-week-grid";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import {
  isAnswerComplete,
  OTHER_ANSWER_MAX_LENGTH,
  TEXT_ANSWER_MAX_LENGTH,
} from "@/domain/questions";

export interface QuestionDto {
  id: string;
  type: "SINGLE_CHOICE" | "MULTI_CHOICE" | "TEXT" | "RANKING";
  prompt: string;
  required: boolean;
  allowOther: boolean;
  options: { id: string; label: string }[];
}

export interface AnswerState {
  optionIds: string[];
  text: string;
  ranks: Record<string, number>;
  /** Whether the "Other" radio/checkbox is ticked. */
  other: boolean;
  otherText: string;
}

interface Props {
  eventId: string;
  initialRanges: AvailabilityRange[];
  /** The user's standing week, for "Reload from my saved availability". */
  standingRanges: AvailabilityRange[];
  questions: QuestionDto[];
  initialAnswers: Record<string, AnswerState>;
  alreadySubmitted: boolean;
  /** The viewer's clock format, passed down from the page — never read here. */
  clockFormat: ClockFormat;
}

type SubmitStatus = "idle" | "submitting" | "submitted" | "error";

const inputClass =
  "rounded border border-edge-strong bg-field px-3 py-2 text-sm";

const smallButton =
  "rounded border border-edge-strong px-3 py-1 hover:bg-btn-secondary-hover disabled:opacity-50";

function buildAnswerState(
  questions: QuestionDto[],
  initialAnswers: Record<string, AnswerState>,
): Record<string, AnswerState> {
  const state: Record<string, AnswerState> = {};
  for (const question of questions) {
    state[question.id] = initialAnswers[question.id] ?? {
      optionIds: [],
      text: "",
      ranks: {},
      other: false,
      otherText: "",
    };
  }
  return state;
}

// Order-insensitive: unchecking and rechecking options, or clearing and
// re-picking the same ranks, must not count as an unsaved change.
function answerEqual(a: AnswerState, b: AnswerState): boolean {
  if (a.text !== b.text) return false;
  // Only the Other text that would actually be submitted counts.
  if ((a.other ? a.otherText : "") !== (b.other ? b.otherText : "")) {
    return false;
  }
  const aIds = [...a.optionIds].sort();
  const bIds = [...b.optionIds].sort();
  if (aIds.length !== bIds.length || aIds.some((id, i) => id !== bIds[i])) {
    return false;
  }
  const aRanks = Object.entries(a.ranks).sort(([x], [y]) => x.localeCompare(y));
  const bRanks = Object.entries(b.ranks).sort(([x], [y]) => x.localeCompare(y));
  return (
    aRanks.length === bRanks.length &&
    aRanks.every(([id, rank], i) => bRanks[i][0] === id && bRanks[i][1] === rank)
  );
}

// Courtesy mirror of the server's required check — the server is the gate.
function isAnswered(question: QuestionDto, answer: AnswerState): boolean {
  return isAnswerComplete(question, {
    optionIds: answer.optionIds,
    text: answer.text,
    rankCount: Object.keys(answer.ranks).length,
    otherText: answer.other ? answer.otherText : "",
  });
}

export function RespondForm({
  eventId,
  initialRanges,
  standingRanges,
  questions,
  initialAnswers,
  alreadySubmitted,
  clockFormat,
}: Props) {
  const { initialWeek, weekRef, gridKey, gridProps, replaceWeek } =
    useWeekGrid(initialRanges);
  const [confirmingReload, setConfirmingReload] = useState(false);

  const [initialAnswerState] = useState(() =>
    buildAnswerState(questions, initialAnswers),
  );
  const [answers, setAnswers] =
    useState<Record<string, AnswerState>>(initialAnswerState);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // The last successful submit; dirtiness compares against it, so a
  // standing-week reload counts as unsaved while edit-then-undo does not.
  const savedRef = useRef({ week: initialWeek, answers: initialAnswerState });
  useUnsavedChangesGuard(
    () =>
      !weeksEqual(weekRef.current, savedRef.current.week) ||
      questions.some(
        (question) =>
          !answerEqual(
            answers[question.id],
            savedRef.current.answers[question.id],
          ),
      ),
  );

  function update(questionId: string, patch: Partial<AnswerState>) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...patch },
    }));
  }

  // Browser-side only: the form now shows the standing week, but nothing is
  // stored until the user submits as normal.
  function reloadFromStanding() {
    replaceWeek(weekFromRanges(standingRanges));
    setConfirmingReload(false);
  }

  async function submit() {
    const sentWeek = weekRef.current;
    const sentAnswers = answers;

    // Client-side courtesy check; the server enforces the same rule.
    const missingRequired = questions.find(
      (question) =>
        question.required && !isAnswered(question, sentAnswers[question.id]),
    );
    if (missingRequired) {
      setErrorMessage(
        `Please answer the required question "${missingRequired.prompt}".`,
      );
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ranges: cellsToRanges(weekToCells(sentWeek)),
          answers: questions.map((question) => {
            const answer = sentAnswers[question.id];
            return {
              questionId: question.id,
              optionIds: answer.optionIds,
              text: answer.text,
              // Other counts only while ticked; the server treats an empty
              // string as "Other not selected".
              otherText: answer.other ? answer.otherText : "",
              ranks: Object.entries(answer.ranks).map(([optionId, rank]) => ({
                optionId,
                rank,
              })),
            };
          }),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `submit failed (${response.status})`);
      }
      savedRef.current = { week: sentWeek, answers: sentAnswers };
      setStatus("submitted");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Submit failed.",
      );
      setStatus("error");
    }
  }

  // The only submit control sits below the questions.
  function submitControls(margin: string) {
    return (
      <div className={`${margin} flex items-center gap-3`}>
        <button
          type="button"
          onClick={submit}
          disabled={status === "submitting" || status === "submitted"}
          className="rounded bg-btn-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-primary-hover disabled:opacity-50"
        >
          {status === "submitting"
            ? "Submitting…"
            : alreadySubmitted && status !== "submitted"
              ? "Resubmit"
              : "Submit"}
        </button>
        {status === "submitted" && (
          <span className="text-sm text-status-submitted">
            Response submitted ✓
          </span>
        )}
        {status === "error" && (
          <span className="text-sm text-error">{errorMessage}</span>
        )}
      </div>
    );
  }

  // One-line "Other" input with the same cap-and-counter style as text
  // answers; revealed only while Other is ticked.
  function renderOtherInput(question: QuestionDto, answer: AnswerState) {
    return (
      <div className="ml-6">
        <input
          type="text"
          value={answer.otherText}
          onChange={(e) => update(question.id, { otherText: e.target.value })}
          aria-label={`Other answer for "${question.prompt}"`}
          className={`w-full ${inputClass}`}
        />
        <p
          className={`mt-1 text-xs ${
            answer.otherText.length > OTHER_ANSWER_MAX_LENGTH
              ? "text-error"
              : "text-faint"
          }`}
        >
          {answer.otherText.length}/{OTHER_ANSWER_MAX_LENGTH}
        </p>
      </div>
    );
  }

  function renderQuestion(question: QuestionDto, index: number) {
    const answer = answers[question.id];
    return (
      <li
        key={question.id}
        className="rounded border border-edge p-4"
      >
        <p className="mb-3 text-sm font-medium">
          {index + 1}. {question.prompt}
          {question.required && (
            <span className="ml-2 text-xs font-normal text-hint">required</span>
          )}
        </p>

        {question.type === "SINGLE_CHOICE" && (
          <div className="flex flex-col gap-1 text-sm">
            {question.options.map((option) => (
              <label key={option.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  checked={answer.optionIds[0] === option.id}
                  onChange={() =>
                    update(question.id, { optionIds: [option.id], other: false })
                  }
                />
                {option.label}
              </label>
            ))}
            {question.allowOther && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  checked={answer.other}
                  onChange={() =>
                    update(question.id, { optionIds: [], other: true })
                  }
                />
                Other
              </label>
            )}
            {question.allowOther &&
              answer.other &&
              renderOtherInput(question, answer)}
            {/* A radio cannot be unticked, so clearing needs its own control. */}
            {(answer.optionIds.length > 0 || answer.other) && (
              <button
                type="button"
                onClick={() =>
                  update(question.id, {
                    optionIds: [],
                    other: false,
                    otherText: "",
                  })
                }
                className="self-start text-xs text-hint hover:underline"
              >
                Clear answer
              </button>
            )}
          </div>
        )}

        {question.type === "MULTI_CHOICE" && (
          <div className="flex flex-col gap-1 text-sm">
            {question.options.map((option) => {
              const checked = answer.optionIds.includes(option.id);
              return (
                <label key={option.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      update(question.id, {
                        optionIds: e.target.checked
                          ? [...answer.optionIds, option.id]
                          : answer.optionIds.filter((id) => id !== option.id),
                      })
                    }
                  />
                  {option.label}
                </label>
              );
            })}
            {question.allowOther && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={answer.other}
                  onChange={(e) =>
                    update(
                      question.id,
                      e.target.checked
                        ? { other: true }
                        : { other: false, otherText: "" },
                    )
                  }
                />
                Other
              </label>
            )}
            {question.allowOther &&
              answer.other &&
              renderOtherInput(question, answer)}
          </div>
        )}

        {question.type === "TEXT" && (
          <div>
            <textarea
              value={answer.text}
              onChange={(e) => update(question.id, { text: e.target.value })}
              rows={3}
              aria-label={question.prompt}
              className={`w-full ${inputClass}`}
            />
            <p
              className={`mt-1 text-xs ${
                answer.text.length > TEXT_ANSWER_MAX_LENGTH
                  ? "text-error"
                  : "text-faint"
              }`}
            >
              {answer.text.length}/{TEXT_ANSWER_MAX_LENGTH}
            </p>
          </div>
        )}

        {question.type === "RANKING" && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="mb-1 text-xs text-hint">
              Rank every option; 1 is your top pick, each rank used once.
            </p>
            {question.options.map((option) => (
              <label
                key={option.id}
                className="flex items-center justify-between gap-2"
              >
                {option.label}
                <select
                  value={answer.ranks[option.id] ?? ""}
                  onChange={(e) => {
                    const ranks = { ...answer.ranks };
                    if (e.target.value === "") delete ranks[option.id];
                    else ranks[option.id] = Number(e.target.value);
                    update(question.id, { ranks });
                  }}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {question.options.map((_, rank) => (
                    <option key={rank} value={rank + 1}>
                      {rank + 1}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {Object.keys(answer.ranks).length > 0 && (
              <button
                type="button"
                onClick={() => update(question.id, { ranks: {} })}
                className="self-start text-xs text-hint hover:underline"
              >
                Clear answer
              </button>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div>
      <WeekGridEditor
        key={gridKey}
        {...gridProps}
        clockFormat={clockFormat}
        extraControls={
          <div className="flex flex-wrap items-center gap-2">
            {confirmingReload ? (
              <>
                <span className="text-muted">
                  Replace this grid with your saved week? Edits made here for
                  this event will be lost.
                </span>
                <button
                  type="button"
                  onClick={reloadFromStanding}
                  className="rounded border border-btn-danger-border px-3 py-1 text-btn-danger-text hover:bg-btn-danger-wash"
                >
                  Yes, replace
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReload(false)}
                  className={smallButton}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingReload(true)}
                className={`${smallButton} text-muted`}
              >
                Reload from my saved availability
              </button>
            )}
          </div>
        }
      />

      {questions.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-medium">Questions</h2>
          <ul className="flex flex-col gap-3">{questions.map(renderQuestion)}</ul>
        </section>
      )}

      {submitControls("mt-6")}
    </div>
  );
}
