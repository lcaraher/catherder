import type { ReactNode } from "react";
import { AnswersView } from "@/components/answers-view";
import { OrganizerBadge } from "@/components/organizer-badge";
import { choiceTallies, rankingTallies } from "@/domain/question-tallies";

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

interface BarRow {
  label: string;
  count: number;
  text: string;
}

// Label, bar and count per row; each fill is its count's share of the total.
function AnswerBars({ rows, total }: { rows: BarRow[]; total: number }) {
  return (
    <div className="answer-bars mb-1 text-xs">
      {rows.map((row, i) => (
        <div key={i} className="answer-bar-row">
          <span className="text-foreground">{row.label}</span>
          <span
            aria-hidden="true"
            className="block h-3 overflow-hidden rounded-bar bg-surface-raised col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
          >
            <span
              className="block h-full rounded-bar bg-heat-5"
              style={{ width: `${total > 0 ? (row.count / total) * 100 : 0}%` }}
            />
          </span>
          <span className="text-muted tabular-nums col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto">
            {row.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function Missing({ count, verb }: { count: number; verb: "answered" | "ranked" }) {
  if (count <= 0) return null;
  return (
    <p className="mt-1 text-xs text-hint">
      {count === 1 ? `1 hasn't ${verb} yet.` : `${count} haven't ${verb} yet.`}
    </p>
  );
}

/** One question's answers: the text answers, or a choice question's totals and per-person table. */
export function QuestionResults({ index, question, respondents, answers, visible, control }: Props) {
  const byUser = new Map(answers.map((answer) => [answer.userId, answer]));
  const labelById = new Map(question.options.map((option) => [option.id, option.label]));

  let totals: ReactNode = null;
  if (question.type === "RANKING") {
    const tallies = rankingTallies(question, respondents, answers);
    totals = (
      <>
        <p className="mb-1.5 text-xs text-hint">Ranked first by:</p>
        <AnswerBars
          total={tallies.total}
          rows={tallies.rows.map((row) => ({
            label: row.label,
            count: row.firstCount,
            text:
              row.averagePlace === null
                ? `${row.firstCount} of ${tallies.total}`
                : `${row.firstCount} of ${tallies.total} · average place ${row.averagePlace.toFixed(1)}`,
          }))}
        />
        <Missing count={tallies.notRanked} verb="ranked" />
      </>
    );
  } else if (question.type !== "TEXT") {
    const tallies = choiceTallies(question, respondents, answers);
    totals = (
      <>
        <AnswerBars
          total={tallies.total}
          rows={tallies.rows.map((row) => ({
            label: row.label,
            count: row.count,
            text: `${row.count} of ${tallies.total}`,
          }))}
        />
        {tallies.otherTexts.length > 0 && (
          <div className="mt-1.5 text-xs text-muted">
            Other:
            <ul className="mt-0.5">
              {tallies.otherTexts.map((text, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  {text}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Missing count={tallies.notAnswered} verb="answered" />
      </>
    );
  }

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
        <AnswersView
          totals={totals}
          each={
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
          }
        />
      )}
    </div>
  );
}
