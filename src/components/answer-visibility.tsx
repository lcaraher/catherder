"use client";

import { startTransition, useState } from "react";
import { EyeIcon } from "@/components/eye-icon";
import { SaveMessage, useSaveForm, type SaveAction } from "@/components/save-form";
import { Segmented } from "@/components/segmented";

interface Props {
  /** The setQuestionAnswersRevealed server action, passed down from the page. */
  action: SaveAction;
  questionId: string;
  revealed: boolean;
}

/** One question's answer visibility switch; a click saves at once. */
export function AnswerVisibility({ action, questionId, revealed }: Props) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const { formProps, confirmation, error, errorId, clearError } = useSaveForm({ action });
  // A failed save shows the saved value again.
  const shown = error ? revealed : (chosen ?? revealed);

  function choose(value: string) {
    const next = value === "true";
    if (next === shown) return;
    setChosen(next);
    clearError();
    const formData = new FormData();
    formData.set("questionId", questionId);
    formData.set("revealed", value);
    startTransition(() => formProps.action(formData));
  }

  return (
    <div>
      <div className="flex items-center">
        <Segmented
          label="Answer visibility"
          size="sm"
          value={String(shown)}
          onChange={choose}
          options={[
            {
              value: "false",
              label: (
                <>
                  <EyeIcon open={false} />
                  Hidden from participants
                </>
              ),
              title:
                "Participants cannot see answers to this question even once results are shared.",
            },
            {
              value: "true",
              label: (
                <>
                  <EyeIcon open={true} />
                  Visible to participants
                </>
              ),
              title:
                "Participants can see everyone's answers to this question once results are shared.",
            },
          ]}
        />
        {confirmation && (
          <span aria-hidden="true" className="pop-in ml-2">
            ✓
          </span>
        )}
      </div>
      <SaveMessage error={error} id={errorId} />
    </div>
  );
}
