"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import { SECONDARY_SM } from "@/components/button-classes";
import { EventDescription } from "@/components/event-description";
import { ReaderPreviewDisclosure } from "@/components/reader-preview-disclosure";
import {
  SaveButton,
  SaveMessage,
  UnsavedNote,
  useSaveForm,
  type SaveAction,
} from "@/components/save-form";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { EVENT_DESCRIPTION_MAX_LENGTH, descriptionCounterVisible } from "@/domain/events";

// Browser-only; until it loads, an empty box the size of its frame and toolbar.
const DescriptionEditor = dynamic(
  () => import("./description-editor").then((m) => m.DescriptionEditor),
  {
    ssr: false,
    loading: () => (
      <div data-editor-loading className="min-h-70.25 rounded border border-edge-strong bg-field md:min-h-60.75" />
    ),
  },
);

interface Props {
  /** The updateEventDescription server action, passed down from the page. */
  action: SaveAction;
  eventId: string;
  initialText: string;
}

/** Description editor on the event page, with the text-answer style counter and a live Reader Preview. */
export function EventDescriptionForm({ action, eventId, initialText }: Props) {
  const [text, setText] = useState(initialText);
  const [savedText, setSavedText] = useState(initialText);
  const editorRef = useRef<MDXEditorMethods>(null);
  const overCap = text.length > EVENT_DESCRIPTION_MAX_LENGTH;
  const dirty = text !== savedText;
  useUnsavedChangesGuard(() => dirty);
  const { formProps, confirmation, error, errorId } = useSaveForm({
    action,
    onSaved: (formData) => setSavedText(String(formData.get("description") ?? "")),
  });
  // MDXEditor tidying the text it was given is not an edit.
  const onChange = useCallback((markdown: string, initialMarkdownNormalize: boolean) => {
    setText(markdown);
    if (initialMarkdownNormalize) setSavedText(markdown);
  }, []);
  const discard = () => {
    editorRef.current?.setMarkdown(savedText);
    setText(savedText);
  };

  return (
    <>
      <form {...formProps} className="flex flex-col gap-2 text-sm">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="description" value={text} />
        <div data-over-limit={overCap || undefined}>
          <DescriptionEditor
            markdown={initialText}
            savedMarkdown={savedText}
            onChange={onChange}
            editorRef={editorRef}
          />
        </div>
        {descriptionCounterVisible(text.length) && (
          <p className={`text-xs ${overCap ? "text-error" : "text-faint"}`}>
            {text.length}/{EVENT_DESCRIPTION_MAX_LENGTH}
          </p>
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <UnsavedNote onDiscard={discard} />}
            <SaveButton
              inactive={!dirty}
              className={SECONDARY_SM}
              confirmText="Saved"
              confirmation={confirmation}
            >
              Save
            </SaveButton>
          </div>
          <SaveMessage error={error} id={errorId} />
        </div>
      </form>
      <ReaderPreviewDisclosure>
        <div className="mt-3">
          <EventDescription text={text} />
        </div>
      </ReaderPreviewDisclosure>
    </>
  );
}
