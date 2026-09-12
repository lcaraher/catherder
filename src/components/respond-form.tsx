"use client";

import { useRef, useState } from "react";
import {
  cellsToRanges,
  weekFromRanges,
  weekToCells,
  type AvailabilityRange,
  type SlotStatus,
} from "@/domain/availability";
import { WeekGridEditor } from "@/components/week-grid-editor";

export interface QuestionDto {
  id: string;
  type: "SINGLE_CHOICE" | "MULTI_CHOICE" | "TEXT" | "RANKING";
  prompt: string;
  options: { id: string; label: string }[];
}

export interface AnswerState {
  optionIds: string[];
  text: string;
  ranks: Record<string, number>;
}

interface Props {
  eventId: string;
  initialRanges: AvailabilityRange[];
  questions: QuestionDto[];
  initialAnswers: Record<string, AnswerState>;
  alreadySubmitted: boolean;
}

type SubmitStatus = "idle" | "submitting" | "submitted" | "error";

const inputClass =
  "rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function RespondForm({
  eventId,
  initialRanges,
  questions,
  initialAnswers,
  alreadySubmitted,
}: Props) {
  const [initialWeek] = useState(() => weekFromRanges(initialRanges));
  const weekRef = useRef<SlotStatus[][]>(initialWeek);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const state: Record<string, AnswerState> = {};
    for (const question of questions) {
      state[question.id] = initialAnswers[question.id] ?? {
        optionIds: [],
        text: "",
        ranks: {},
      };
    }
    return state;
  });
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function update(questionId: string, patch: Partial<AnswerState>) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...patch },
    }));
  }

  async function submit() {
    setStatus("submitting");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ranges: cellsToRanges(weekToCells(weekRef.current)),
          answers: questions.map((question) => {
            const answer = answers[question.id];
            return {
              questionId: question.id,
              optionIds: answer.optionIds,
              text: answer.text,
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
      setStatus("submitted");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Submit failed.",
      );
      setStatus("error");
    }
  }

  function renderQuestion(question: QuestionDto, index: number) {
    const answer = answers[question.id];
    return (
      <li
        key={question.id}
        className="rounded border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <p className="mb-3 text-sm font-medium">
          {index + 1}. {question.prompt}
        </p>

        {question.type === "SINGLE_CHOICE" && (
          <div className="flex flex-col gap-1 text-sm">
            {question.options.map((option) => (
              <label key={option.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  checked={answer.optionIds[0] === option.id}
                  onChange={() => update(question.id, { optionIds: [option.id] })}
                />
                {option.label}
              </label>
            ))}
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
          </div>
        )}

        {question.type === "TEXT" && (
          <textarea
            value={answer.text}
            onChange={(e) => update(question.id, { text: e.target.value })}
            rows={3}
            aria-label={question.prompt}
            className={`w-full ${inputClass}`}
          />
        )}

        {question.type === "RANKING" && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="mb-1 text-xs text-zinc-500">
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
          </div>
        )}
      </li>
    );
  }

  return (
    <div>
      <WeekGridEditor
        initialWeek={initialWeek}
        onChange={(week) => {
          weekRef.current = week;
        }}
      />

      {questions.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-medium">Questions</h2>
          <ul className="flex flex-col gap-3">{questions.map(renderQuestion)}</ul>
        </section>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={status === "submitting" || status === "submitted"}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {status === "submitting"
            ? "Submitting…"
            : alreadySubmitted && status !== "submitted"
              ? "Resubmit"
              : "Submit"}
        </button>
        {status === "submitted" && (
          <span className="text-sm text-emerald-600">
            Response submitted ✓
          </span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-600">{errorMessage}</span>
        )}
      </div>
    </div>
  );
}
