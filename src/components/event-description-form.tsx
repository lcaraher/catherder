"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import { SECONDARY_SM } from "@/components/button-classes";
import type { PictureUploadTracker } from "@/components/description-editor";
import { EventDescription } from "@/components/event-description";
import { UPLOAD_STAGE_WORDS, type UploadStage } from "@/components/picture-upload";
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
  const [pictureError, setPictureError] = useState<string | null>(null);
  // Pasted and dropped pictures still uploading, oldest first, each at its stage once it has one.
  const [uploads, setUploads] = useState<{ id: number; stage: UploadStage | null }[]>([]);
  const nextUpload = useRef(0);
  const trackPictureUpload = useCallback((): PictureUploadTracker => {
    nextUpload.current += 1;
    const id = nextUpload.current;
    setUploads((list) => [...list, { id, stage: null }]);
    return {
      stage: (stage) =>
        setUploads((list) => list.map((upload) => (upload.id === id ? { id, stage } : upload))),
      end: () => setUploads((list) => list.filter((upload) => upload.id !== id)),
    };
  }, []);
  const uploadStage = uploads.findLast((upload) => upload.stage !== null)?.stage ?? null;
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
            eventId={eventId}
            onPictureRefused={setPictureError}
            trackPictureUpload={trackPictureUpload}
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
          {/* Always in the page, so its words are announced; empty and without height when idle. */}
          <p
            role="status"
            className={uploadStage ? "mt-1 flex items-center gap-2 text-xs text-muted" : undefined}
          >
            {uploadStage && (
              <>
                <span aria-hidden="true" className="spinner" />
                {UPLOAD_STAGE_WORDS[uploadStage]}
              </>
            )}
          </p>
          {pictureError && (
            <p role="alert" className="mt-1 text-xs text-error">
              {pictureError}
            </p>
          )}
        </div>
      </form>
      <ReaderPreviewDisclosure>
        <div className="mt-3">
          <EventDescription eventId={eventId} text={text} />
        </div>
      </ReaderPreviewDisclosure>
    </>
  );
}
