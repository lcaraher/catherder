"use client";

import { SECONDARY_SM } from "@/components/button-classes";
import { SaveButton, SaveMessage, useSaveForm, type SaveAction } from "@/components/save-form";

interface Props {
  /** The addQuestionOption server action, passed down from the page. */
  action: SaveAction;
  questionId: string;
}

/** The new-option field under a choice or ranking question's options. */
export function AddOptionForm({ action, questionId }: Props) {
  const { formProps, confirmation, error, errorId, fieldProps } = useSaveForm({
    action,
    resetOnSave: true,
  });

  return (
    <form {...formProps}>
      <input type="hidden" name="questionId" value={questionId} />
      <label htmlFor={`new-option-${questionId}`} className="mb-1 block text-muted">
        New option
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`new-option-${questionId}`}
          name="label"
          placeholder="New option"
          {...fieldProps("label")}
          className="flex-1 rounded border border-edge-strong bg-field px-2 py-1 text-sm aria-invalid:border-error"
        />
        <SaveButton className={SECONDARY_SM} confirmText="Saved" confirmation={confirmation}>
          Add option
        </SaveButton>
      </div>
      <SaveMessage error={error} id={errorId} />
    </form>
  );
}
