"use client";

interface Props {
  /** The deleteQuestion server action, passed down from the page. */
  action: (formData: FormData) => void | Promise<void>;
  questionId: string;
  answerCount: number;
}

/** Delete control on a question card; always confirmed before it runs. */
export function QuestionDeleteForm({ action, questionId, answerCount }: Props) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !confirm(
            `Delete this question and its ${answerCount} answer${answerCount === 1 ? "" : "s"}? It cannot be undone from the app.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="questionId" value={questionId} />
      <button
        type="submit"
        className="rounded border border-btn-danger-border px-2 py-1 text-xs text-btn-danger-text hover:bg-btn-danger-wash"
      >
        Delete
      </button>
    </form>
  );
}
