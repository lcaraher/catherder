// Pure question-related rules: no framework, adapter, or I/O imports.

export type QuestionType =
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "TEXT"
  | "RANKING";

// Size limit for TEXT answers (a cap, not sanitisation).
export const TEXT_ANSWER_MAX_LENGTH = 2000;

// Size limit for the free-text "Other" on choice questions.
export const OTHER_ANSWER_MAX_LENGTH = 200;

export interface AnswerCompletenessInput {
  optionIds: readonly string[];
  text: string;
  rankCount: number;
  otherText: string;
}

// Whether an answer counts as given, for the required-question check.
// "Other" with text counts only when the question allows Other.
export function isAnswerComplete(
  question: { type: QuestionType; allowOther: boolean },
  answer: AnswerCompletenessInput,
): boolean {
  switch (question.type) {
    case "TEXT":
      return answer.text.trim() !== "";
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return (
        answer.optionIds.length > 0 ||
        (question.allowOther && answer.otherText.trim() !== "")
      );
    case "RANKING":
      return answer.rankCount > 0;
  }
}
