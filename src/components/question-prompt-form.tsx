"use client";

import { SECONDARY_SM } from "@/components/button-classes";
import { SaveButton, SaveMessage, useSaveForm, type SaveAction } from "@/components/save-form";

interface Props {
  /** The updateQuestionPrompt server action, passed down from the page. */
  action: SaveAction;
  questionId: string;
  initialPrompt: string;
  /** Whether answers exist — a changed prompt then starts a fresh version. */
  hasAnswers: boolean;
}

/**
 * Prompt editor on a question card: when answers exist and the wording
 * changed, the manager confirms before the server action runs.
 */
export function QuestionPromptForm({
  action,
  questionId,
  initialPrompt,
  hasAnswers,
}: Props) {
  const { formProps, confirmation, error, errorId, fieldProps } = useSaveForm({
    action,
    beforeSubmit: (form) => {
      const prompt = (form.elements.namedItem("prompt") as HTMLInputElement).value;
      return (
        !hasAnswers ||
        prompt === initialPrompt ||
        confirm(
          "People have already answered this question. Changing the wording starts a fresh version; their answers stay with the old wording. Continue?",
        )
      );
    },
  });

  return (
    <form {...formProps} className="mb-2">
      <input type="hidden" name="questionId" value={questionId} />
      <div>
        <label
          htmlFor={`question-prompt-${questionId}`}
          className="mb-1 block text-muted"
        >
          Question
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`question-prompt-${questionId}`}
            name="prompt"
            defaultValue={initialPrompt}
            {...fieldProps("prompt")}
            className="flex-1 rounded border border-edge-strong bg-field px-2 py-1 text-sm aria-invalid:border-error"
          />
          <SaveButton className={SECONDARY_SM} confirmText="Saved" confirmation={confirmation}>
            Save prompt
          </SaveButton>
        </div>
        <SaveMessage error={error} id={errorId} />
      </div>
    </form>
  );
}
