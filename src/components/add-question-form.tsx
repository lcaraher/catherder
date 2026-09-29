"use client";

import { SECONDARY_SM } from "@/components/button-classes";
import { Select } from "@/components/form-controls";
import { SaveButton, SaveMessage, useSaveForm, type SaveAction } from "@/components/save-form";

const inputClass =
  "rounded border border-edge-strong bg-field px-2 py-1 text-sm aria-invalid:border-error";

interface Props {
  /** The addQuestion server action, passed down from the page. */
  action: SaveAction;
  eventId: string;
}

/** The Add a question form at the foot of the Questions section. */
export function AddQuestionForm({ action, eventId }: Props) {
  const { formProps, confirmation, error, errorId, fieldProps } = useSaveForm({
    action,
    resetOnSave: true,
  });

  return (
    <form {...formProps} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="eventId" value={eventId} />
      <div>
        <label htmlFor="add-question-type" className="mb-1 block text-muted">
          Question type
        </label>
        <Select
          id="add-question-type"
          name="type"
          {...fieldProps("type")}
          className="px-2 py-1 text-sm aria-invalid:border-error"
          wrapperClassName="w-full"
        >
          <option value="SINGLE_CHOICE">Single choice</option>
          <option value="MULTI_CHOICE">Multiple choice</option>
          <option value="TEXT">Text</option>
          <option value="RANKING">Ranking</option>
        </Select>
      </div>
      <div>
        <label htmlFor="add-question-prompt" className="mb-1 block text-muted">
          Question
        </label>
        <input
          id="add-question-prompt"
          name="prompt"
          placeholder="Prompt"
          required
          {...fieldProps("prompt")}
          className={`w-full ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor="add-question-options" className="mb-1 block text-muted">
          Options
        </label>
        <textarea
          id="add-question-options"
          name="options"
          rows={3}
          placeholder="Options, one per line (not used for Text questions)"
          {...fieldProps("options")}
          className={`block w-full ${inputClass}`}
        />
      </div>
      <div>
        <SaveButton className={SECONDARY_SM} confirmText="Saved" confirmation={confirmation}>
          Add question
        </SaveButton>
        <SaveMessage error={error} id={errorId} />
      </div>
    </form>
  );
}
