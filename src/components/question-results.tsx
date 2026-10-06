import type { ReactNode } from "react";
import { OrganizerBadge } from "@/components/organizer-badge";

export const th = "py-1 pr-4 font-small text-xs font-medium text-muted";
export const td = "border-t border-edge py-2 pr-4 align-top";

export interface ResultsQuestion {
  id: string;
  type: "SINGLE_CHOICE" | "MULTI_CHOICE" | "TEXT" | "RANKING";
  prompt: string;
  allowOther: boolean;
  options: { id: string; label: string }[];
}

export interface ResultsRespondent {
  userId: string;
  displayName: string;
  isOrganizer: boolean;
}

export interface ResultsAnswer {
  userId: string;
  choices: { optionId: string; rank: number | null }[];
  text: { text: string } | null;
  otherText: string | null;
}

interface Props {
  /** The question's position, from 0. */
  index: number;
  question: ResultsQuestion;
  /** The people whose answers are listed and counted, in display order. */
  respondents: ResultsRespondent[];
  /** This question's answers. */
  answers: ResultsAnswer[];
  /** Whether the viewer may see the answers. */
  visible: boolean;
  /** Shown between the prompt and the answers. */
  control?: ReactNode;
}

/** One question's answers: the text answers, or a table of choices with their totals. */
export function QuestionResults({ index, question, respondents, answers, visible, control }: Props) {
  const byUser = new Map(answers.map((answer) => [answer.userId, answer]));
  const respondentIds = new Set(respondents.map((respondent) => respondent.userId));
  const labelById = new Map(question.options.map((option) => [option.id, option.label]));
  // Tallies count respondents only; a non-participating organizer's answers never do.
  const counted = [...byUser.values()].filter((answer) => respondentIds.has(answer.userId));

  return (
    <div className="rounded border border-edge p-4 text-sm">
      <p className={`${control ? "mb-2" : "mb-3"} font-medium`}>
        {index + 1}. {question.prompt}
      </p>
      {control && <div className="mb-3">{control}</div>}

      {!visible ? (
        <p className="text-xs text-hint">
          The organizer has not shared answers for this question.
        </p>
      ) : question.type === "TEXT" ? (
        <ul className="flex flex-col gap-2">
          {respondents.map((respondent) => {
            const text = byUser.get(respondent.userId)?.text?.text.trim();
            return (
              <li key={respondent.userId}>
                <span className="text-xs text-muted">
                  <span className="break-words">{respondent.displayName}</span>
                  {respondent.isOrganizer && <OrganizerBadge className="ml-2 align-middle" />}
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
                <th className={th}>{question.type === "RANKING" ? "Ranked order" : "Choice"}</th>
              </tr>
            </thead>
            <tbody>
              {respondents.map((respondent) => {
                const answer = byUser.get(respondent.userId);
                let display: string | null = null;
                if (answer) {
                  if (question.type === "RANKING") {
                    const ranked = [...answer.choices]
                      .filter((choice) => choice.rank !== null)
                      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
                      .map((choice) => `${choice.rank}. ${labelById.get(choice.optionId) ?? "?"}`);
                    if (ranked.length > 0) display = ranked.join(", ");
                  } else {
                    const chosen = answer.choices
                      .map((choice) => labelById.get(choice.optionId))
                      .filter((label): label is string => Boolean(label));
                    if (answer.otherText) {
                      chosen.push(`Other: ${answer.otherText}`);
                    }
                    if (chosen.length > 0) display = chosen.join(", ");
                  }
                }
                return (
                  <tr key={respondent.userId}>
                    <td className={td}>
                      <span className="break-words">{respondent.displayName}</span>
                      {respondent.isOrganizer && <OrganizerBadge className="ml-2 align-middle" />}
                    </td>
                    <td className={td}>{display ?? <span className="text-hint">no answer</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 mb-0.5 font-small text-xs font-medium text-foreground">Totals</p>
          <ul className="flex flex-col gap-0.5 text-xs text-muted">
            {question.type === "RANKING" && (
              <li className="text-hint">Summed rank per option — lower is better:</li>
            )}
            {question.options.map((option) => {
              if (question.type === "RANKING") {
                const entries = counted.flatMap((answer) =>
                  answer.choices.filter(
                    (choice) => choice.optionId === option.id && choice.rank !== null,
                  ),
                );
                const sum = entries.reduce((total, choice) => total + (choice.rank ?? 0), 0);
                return (
                  <li key={option.id}>
                    {option.label} —{" "}
                    {entries.length > 0
                      ? `${sum} (${entries.length} of ${respondents.length} ranked)`
                      : "not ranked"}
                  </li>
                );
              }
              const count = counted.filter((answer) =>
                answer.choices.some((choice) => choice.optionId === option.id),
              ).length;
              return (
                <li key={option.id}>
                  {option.label} — {count}
                </li>
              );
            })}
            {question.type !== "RANKING" &&
              (() => {
                // Shown while Other is offered, and kept for old Other answers
                // after the setting is turned off.
                const otherTexts = counted
                  .map((answer) => answer.otherText)
                  .filter((text): text is string => Boolean(text));
                if (!question.allowOther && otherTexts.length === 0) return null;
                return (
                  <li>
                    Other — {otherTexts.length}
                    {otherTexts.map((text, i) => (
                      <p key={i} className="whitespace-pre-wrap">
                        {text}
                      </p>
                    ))}
                  </li>
                );
              })()}
          </ul>
        </>
      )}
    </div>
  );
}
