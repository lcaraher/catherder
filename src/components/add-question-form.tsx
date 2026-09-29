"use client";

import { useRef, useState } from "react";
import { DANGER_SM, SECONDARY_SM } from "@/components/button-classes";
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
  const [type, setType] = useState("SINGLE_CHOICE");
  // Each option field's key; field names are option-<key>, submitted in this order.
  const nextKey = useRef(2);
  const [optionKeys, setOptionKeys] = useState([0, 1]);
  const focusKey = useRef<number | null>(null);
  const { formProps, confirmation, error, errorId, fieldProps } = useSaveForm({
    action,
    resetOnSave: true,
    onSaved: () => {
      setType("SINGLE_CHOICE");
      setOptionKeys([nextKey.current, nextKey.current + 1]);
      nextKey.current += 2;
    },
  });

  function addOption() {
    focusKey.current = nextKey.current;
    setOptionKeys((keys) => [...keys, nextKey.current]);
    nextKey.current += 1;
  }

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
          value={type}
          onChange={(e) => setType(e.target.value)}
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
      {type !== "TEXT" && (
        <fieldset>
          <legend className="mb-1 text-muted">Options</legend>
          <ul className="mb-2 flex flex-col gap-1">
            {optionKeys.map((key, i) => (
              <li key={key} className="flex items-center gap-2">
                <label htmlFor={`add-question-option-${key}`} className="sr-only">
                  Option {i + 1}
                </label>
                <input
                  ref={(element) => {
                    if (element && focusKey.current === key) {
                      focusKey.current = null;
                      element.focus();
                    }
                  }}
                  id={`add-question-option-${key}`}
                  name={`option-${key}`}
                  {...fieldProps(`option-${key}`)}
                  className={`min-w-0 flex-1 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={() => setOptionKeys((keys) => keys.filter((other) => other !== key))}
                  aria-label={`Remove option ${i + 1}`}
                  className={DANGER_SM}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={addOption} className={SECONDARY_SM}>
            + Add option
          </button>
        </fieldset>
      )}
      <div>
        <SaveButton className={SECONDARY_SM} confirmText="Saved" confirmation={confirmation}>
          Add question
        </SaveButton>
        <SaveMessage error={error} id={errorId} />
      </div>
    </form>
  );
}
