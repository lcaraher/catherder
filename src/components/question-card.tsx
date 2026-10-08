"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { DANGER_SM, SECONDARY_SM } from "@/components/button-classes";
import { Checkbox } from "@/components/form-controls";
import {
  SaveButton,
  SaveMessage,
  UnsavedNote,
  useSaveForm,
  type SaveAction,
} from "@/components/save-form";
import { Segmented } from "@/components/segmented";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { askLabel } from "@/domain/question-notice";

const inputClass =
  "min-w-0 flex-1 rounded border border-edge-strong bg-field px-2 py-1 text-sm aria-invalid:border-error";

export interface CardQuestion {
  id: string;
  type: "SINGLE_CHOICE" | "MULTI_CHOICE" | "TEXT" | "RANKING";
  prompt: string;
  required: boolean;
  allowOther: boolean;
  answerCount: number;
  options: { id: string; label: string; choiceCount: number }[];
}

interface OptionDraft {
  /** The option's id, or a key made up here for a new one. */
  key: string;
  id?: string;
  label: string;
  removed: boolean;
}

interface Draft {
  prompt: string;
  required: boolean;
  allowOther: boolean;
  options: OptionDraft[];
}

function fromQuestion(question: CardQuestion): Draft {
  return {
    prompt: question.prompt,
    required: question.required,
    allowOther: question.allowOther,
    options: question.options.map((option) => ({
      key: option.id,
      id: option.id,
      label: option.label,
      removed: false,
    })),
  };
}

function wordingChanged(draft: Draft, saved: Draft): boolean {
  if (draft.prompt !== saved.prompt) return true;
  if (draft.options.length !== saved.options.length) return true;
  return draft.options.some(
    (option, i) =>
      option.removed || option.id !== saved.options[i].id || option.label !== saved.options[i].label,
  );
}

function draftEqual(draft: Draft, saved: Draft): boolean {
  return (
    !wordingChanged(draft, saved) &&
    draft.required === saved.required &&
    draft.allowOther === saved.allowOther
  );
}

interface Props {
  /** The saveQuestionCard server action, passed down from the page. */
  action: SaveAction;
  question: CardQuestion;
  /** The card's top row: type, badges, ↑, ↓ and Delete, which act at once. */
  header: ReactNode;
}

/** A question card: every change stays in the card until Save changes. */
export function QuestionCard({ action, question, header }: Props) {
  const saved = useMemo(() => fromQuestion(question), [question]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [askToCheck, setAskToCheck] = useState(false);
  const shown = draft ?? saved;
  const dirty = draft !== null && !draftEqual(draft, saved);
  useUnsavedChangesGuard(() => dirty);
  const nextKey = useRef(0);
  const focusKey = useRef<string | null>(null);

  const { formProps, confirmation, error, errorId, fieldProps, clearError } = useSaveForm({
    action,
    onSaved: () => {
      setDraft(null);
      setAskToCheck(false);
    },
  });

  const edit = (patch: Partial<Draft>) => setDraft({ ...shown, ...patch });
  const editOption = (key: string, patch: Partial<OptionDraft>) =>
    edit({
      options: shown.options.map((option) => (option.key === key ? { ...option, ...patch } : option)),
    });

  function addOption() {
    nextKey.current += 1;
    const key = `new-${nextKey.current}`;
    focusKey.current = key;
    edit({ options: [...shown.options, { key, label: "", removed: false }] });
  }

  function removeOption(option: OptionDraft) {
    // A new option has nothing saved to undo; it simply goes.
    if (option.id === undefined) {
      edit({ options: shown.options.filter((other) => other.key !== option.key) });
    } else {
      editOption(option.key, { removed: true });
    }
  }

  const answered = question.answerCount > 0;
  const choiceCounts = new Map(question.options.map((option) => [option.id, option.choiceCount]));
  const removedWithChoices = shown.options.filter(
    (option) => option.removed && option.id !== undefined && (choiceCounts.get(option.id) ?? 0) > 0,
  );
  const payload = JSON.stringify({
    questionId: question.id,
    ...shown,
    askToCheck,
  });

  return (
    <li className="unsaved-frame rounded border border-edge p-3 text-sm">
      {header}
      <form {...formProps}>
        <input type="hidden" name="card" value={payload} />
        <label htmlFor={`question-prompt-${question.id}`} className="mb-1 block text-muted">
          Question
        </label>
        <input
          id={`question-prompt-${question.id}`}
          name="prompt"
          value={shown.prompt}
          onChange={(e) => edit({ prompt: e.target.value })}
          {...fieldProps("prompt")}
          className={`mb-2 w-full ${inputClass}`}
        />
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented
            label="Answer requirement"
            size="sm"
            value={String(shown.required)}
            onChange={(value) => edit({ required: value === "true" })}
            options={[
              {
                value: "false",
                label: "Optional",
                title: "Participants may leave this question unanswered.",
              },
              {
                value: "true",
                label: "Required",
                title: "Participants cannot submit a response without answering this question.",
              },
            ]}
          />
          {(question.type === "SINGLE_CHOICE" || question.type === "MULTI_CHOICE") && (
            <Segmented
              label="Other answer"
              size="sm"
              value={String(shown.allowOther)}
              onChange={(value) => edit({ allowOther: value === "true" })}
              options={[
                {
                  value: "false",
                  label: "No Other",
                  title: "Participants pick from the listed options only.",
                },
                {
                  value: "true",
                  label: "Allow Other",
                  title: "Participants may pick Other and type their own short answer.",
                },
              ]}
            />
          )}
        </div>
        {question.type !== "TEXT" && (
          <div className="mb-2">
            <ul className="mb-2 flex flex-col gap-1">
              {shown.options.map((option, i) => (
                <li key={option.key} className="flex items-center gap-2">
                  {option.removed ? (
                    <>
                      <span className="min-w-0 flex-1 px-2 py-1 text-hint line-through">
                        {option.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => editOption(option.key, { removed: false })}
                        aria-label={`Undo removing option ${option.label}`}
                        className={SECONDARY_SM}
                      >
                        Undo
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        ref={(element) => {
                          if (element && focusKey.current === option.key) {
                            focusKey.current = null;
                            element.focus();
                          }
                        }}
                        name={`option-${option.key}`}
                        value={option.label}
                        onChange={(e) => editOption(option.key, { label: e.target.value })}
                        aria-label={`Option ${i + 1}`}
                        {...fieldProps(`option-${option.key}`)}
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(option)}
                        aria-label={`Remove option ${i + 1}`}
                        className={DANGER_SM}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" onClick={addOption} className={SECONDARY_SM}>
              + Add option
            </button>
          </div>
        )}
        {answered && draft !== null && wordingChanged(draft, saved) && (
          <>
            <p className="mb-2 text-xs text-muted">
              People have already answered. Saving starts a fresh version; their answers stay with
              the old wording.
            </p>
            <label className="mb-2 flex items-start gap-2 text-xs">
              <Checkbox checked={askToCheck} onChange={(e) => setAskToCheck(e.target.checked)} />
              {askLabel("check", question.answerCount)}
            </label>
          </>
        )}
        {removedWithChoices.map((option) => {
          const count = choiceCounts.get(option.id!) ?? 0;
          return (
            <p key={option.key} className="mb-2 text-xs text-muted">
              {count} {count === 1 ? "person" : "people"} chose this option. Their choice is removed
              when you save.
            </p>
          );
        })}
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <UnsavedNote
              onDiscard={() => {
                setDraft(null);
                setAskToCheck(false);
                clearError();
              }}
            />
          )}
          <SaveButton
            inactive={!dirty}
            className={SECONDARY_SM}
            confirmText="Saved"
            confirmation={confirmation}
          >
            Save changes
          </SaveButton>
        </div>
        <SaveMessage error={error} id={errorId} />
      </form>
    </li>
  );
}
