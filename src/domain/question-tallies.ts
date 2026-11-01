// Pure tallies of a question's answers: no framework, adapter, or I/O imports.

export interface TallyQuestion {
  allowOther: boolean;
  options: readonly { id: string; label: string }[];
}

export interface TallyRespondent {
  userId: string;
}

export interface TallyAnswer {
  userId: string;
  choices: readonly { optionId: string; rank: number | null }[];
  otherText: string | null;
}

export interface ChoiceTallies {
  /** One row per option in option order, then "Other" when it applies. */
  rows: { label: string; count: number }[];
  /** The counted answers' Other texts, in answer order. */
  otherTexts: string[];
  total: number;
  notAnswered: number;
}

export interface RankingTallies {
  rows: {
    label: string;
    firstCount: number;
    rankedCount: number;
    /** Mean of the ranks given to this option; null when nobody ranked it. */
    averagePlace: number | null;
  }[];
  total: number;
  notRanked: number;
}

// Answers from respondents only; anyone else's answer is never counted.
function countedAnswers<A extends TallyAnswer>(
  respondents: readonly TallyRespondent[],
  answers: readonly A[],
): A[] {
  const ids = new Set(respondents.map((respondent) => respondent.userId));
  return answers.filter((answer) => ids.has(answer.userId));
}

// Totals for a SINGLE_CHOICE or MULTI_CHOICE question.
export function choiceTallies(
  question: TallyQuestion,
  respondents: readonly TallyRespondent[],
  answers: readonly TallyAnswer[],
): ChoiceTallies {
  const counted = countedAnswers(respondents, answers);
  const rows = question.options.map((option) => ({
    label: option.label,
    count: counted.filter((answer) =>
      answer.choices.some((choice) => choice.optionId === option.id),
    ).length,
  }));
  const otherTexts = counted
    .map((answer) => answer.otherText)
    .filter((text): text is string => Boolean(text));
  // Kept for old Other answers after the question stops allowing Other.
  if (question.allowOther || otherTexts.length > 0) {
    rows.push({ label: "Other", count: otherTexts.length });
  }
  const answered = counted.filter(
    (answer) => answer.choices.length > 0 || Boolean(answer.otherText),
  ).length;
  return {
    rows,
    otherTexts,
    total: respondents.length,
    notAnswered: respondents.length - answered,
  };
}

// Totals for a RANKING question; lower ranks are better.
export function rankingTallies(
  question: TallyQuestion,
  respondents: readonly TallyRespondent[],
  answers: readonly TallyAnswer[],
): RankingTallies {
  const counted = countedAnswers(respondents, answers);
  const firstByAnswer = counted.map((answer) => {
    let first: { optionId: string; rank: number } | null = null;
    for (const choice of answer.choices) {
      if (choice.rank !== null && (first === null || choice.rank < first.rank)) {
        first = { optionId: choice.optionId, rank: choice.rank };
      }
    }
    return first?.optionId ?? null;
  });
  const rows = question.options.map((option) => {
    const ranks = counted
      .map((answer) =>
        answer.choices.find((choice) => choice.optionId === option.id && choice.rank !== null),
      )
      .filter((choice) => choice !== undefined)
      .map((choice) => choice.rank as number);
    return {
      label: option.label,
      firstCount: firstByAnswer.filter((optionId) => optionId === option.id).length,
      rankedCount: ranks.length,
      averagePlace:
        ranks.length > 0 ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : null,
    };
  });
  const ranked = firstByAnswer.filter((optionId) => optionId !== null).length;
  return { rows, total: respondents.length, notRanked: respondents.length - ranked };
}
