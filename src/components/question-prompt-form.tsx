"use client";

import { SECONDARY_SM } from "@/components/button-classes";

interface Props {
  /** The updateQuestionPrompt server action, passed down from the page. */
  action: (formData: FormData) => void | Promise<void>;
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
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const prompt = (
          event.currentTarget.elements.namedItem("prompt") as HTMLInputElement
        ).value;
        if (
          hasAnswers &&
          prompt !== initialPrompt &&
          !confirm(
            "People have already answered this question. Changing the wording starts a fresh version; their answers stay with the old wording. Continue?",
          )
        ) {
          event.preventDefault();
        }
      }}
      className="mb-2 flex items-center gap-2"
    >
      <input type="hidden" name="questionId" value={questionId} />
      <input
        name="prompt"
        defaultValue={initialPrompt}
        className="flex-1 rounded border border-edge-strong bg-field px-2 py-1 text-sm"
      />
      <button
        type="submit"
        className={SECONDARY_SM}
      >
        Save prompt
      </button>
    </form>
  );
}
