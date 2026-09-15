"use client";

interface Props {
  /** The updateQuestionOption server action, passed down from the page. */
  updateAction: (formData: FormData) => void | Promise<void>;
  /** The removeQuestionOption server action, passed down from the page. */
  removeAction: (formData: FormData) => void | Promise<void>;
  optionId: string;
  initialLabel: string;
  /** Whether the question has answers — an edited label starts a fresh version. */
  hasAnswers: boolean;
  /** How many answers chose this option, computed on the server. */
  choiceCount: number;
}

/**
 * One option row on a question card: inline label edit plus removal, each
 * confirmed first when existing answers are affected.
 */
export function QuestionOptionRow({
  updateAction,
  removeAction,
  optionId,
  initialLabel,
  hasAnswers,
  choiceCount,
}: Props) {
  return (
    <li className="flex items-center gap-2">
      <form
        action={updateAction}
        onSubmit={(event) => {
          const label = (
            event.currentTarget.elements.namedItem("label") as HTMLInputElement
          ).value;
          if (
            hasAnswers &&
            label.trim() !== initialLabel &&
            !confirm(
              "People have already answered this question. Changing an option's wording starts a fresh version; their choices stay attached to the option. Continue?",
            )
          ) {
            event.preventDefault();
          }
        }}
        className="flex flex-1 items-center gap-2"
      >
        <input type="hidden" name="optionId" value={optionId} />
        <input
          name="label"
          defaultValue={initialLabel}
          aria-label={`Option label ${initialLabel}`}
          className="flex-1 rounded border border-edge-strong bg-field px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded border border-edge-strong px-2 py-1 text-xs hover:bg-btn-secondary-hover disabled:opacity-40"
        >
          Save
        </button>
      </form>
      <form
        action={removeAction}
        onSubmit={(event) => {
          if (
            choiceCount > 0 &&
            !confirm(
              `${choiceCount} ${choiceCount === 1 ? "person" : "people"} chose this option. Their choice of it will be removed. Continue?`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="optionId" value={optionId} />
        <button
          type="submit"
          aria-label={`Remove option ${initialLabel}`}
          className="rounded border border-edge-strong px-2 py-1 text-xs hover:bg-btn-secondary-hover disabled:opacity-40"
        >
          Remove
        </button>
      </form>
    </li>
  );
}
