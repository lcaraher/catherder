"use client";

import { DANGER_SM, SECONDARY_SM } from "@/components/button-classes";
import { SaveButton, SaveMessage, useSaveForm, type SaveAction } from "@/components/save-form";

interface Props {
  /** The updateQuestionOption server action, passed down from the page. */
  updateAction: SaveAction;
  /** The removeQuestionOption server action, passed down from the page. */
  removeAction: SaveAction;
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
  const update = useSaveForm({
    action: updateAction,
    beforeSubmit: (form) => {
      const label = (form.elements.namedItem("label") as HTMLInputElement).value;
      return (
        !hasAnswers ||
        label.trim() === initialLabel ||
        confirm(
          "People have already answered this question. Changing an option's wording starts a fresh version; their choices stay attached to the option. Continue?",
        )
      );
    },
  });
  const remove = useSaveForm({
    action: removeAction,
    beforeSubmit: () =>
      choiceCount === 0 ||
      confirm(
        `${choiceCount} ${choiceCount === 1 ? "person" : "people"} chose this option. Their choice of it will be removed. Continue?`,
      ),
  });
  const error = update.error ?? remove.error;
  const errorId = update.error ? update.errorId : remove.errorId;

  return (
    <li>
      <div className="flex items-center gap-2">
        <form {...update.formProps} className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="optionId" value={optionId} />
          <input
            name="label"
            defaultValue={initialLabel}
            aria-label={`Option label ${initialLabel}`}
            {...update.fieldProps("label")}
            className="min-w-0 flex-1 rounded border border-edge-strong bg-field px-2 py-1 text-sm aria-invalid:border-error"
          />
          <SaveButton
            className={SECONDARY_SM}
            confirmText="Saved"
            confirmation={update.confirmation}
          >
            Save
          </SaveButton>
        </form>
        <form {...remove.formProps}>
          <input type="hidden" name="optionId" value={optionId} />
          <button
            type="submit"
            aria-label={`Remove option ${initialLabel}`}
            className={DANGER_SM}
          >
            Remove
          </button>
        </form>
      </div>
      <SaveMessage error={error} id={errorId} />
    </li>
  );
}
