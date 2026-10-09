"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import { SECONDARY_SM } from "@/components/button-classes";
import { Pane } from "@/components/pane";
import { ReaderPreviewDisclosure } from "@/components/reader-preview-disclosure";
import {
  SaveButton,
  SaveMessage,
  UnsavedNote,
  useSaveForm,
  type SaveAction,
} from "@/components/save-form";
import { ShortDescription } from "@/components/short-description";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { SHORT_DESCRIPTION_MAX_LENGTH, shortDescriptionLength } from "@/domain/short-description";

// Browser-only; until it loads, an empty box the size of its frame and toolbar.
const ShortDescriptionEditor = dynamic(
  () => import("./short-description-editor").then((m) => m.ShortDescriptionEditor),
  {
    ssr: false,
    loading: () => (
      <div data-editor-loading className="min-h-31.75 rounded border border-edge-strong bg-field" />
    ),
  },
);

const WIDTHS = { desktop: 768, phone: 390 } as const;
type PreviewWidth = keyof typeof WIDTHS;

interface PreviewProps {
  eventName: string;
  text: string;
  hasDescription: boolean;
  hasQuestions: boolean;
}

// The top of the respond page at its real width, zoomed down to fit the space it has.
function ReaderPreview({ eventName, text, hasDescription, hasQuestions }: PreviewProps) {
  const [width, setWidth] = useState<PreviewWidth>(() =>
    window.matchMedia("(min-width: 48rem)").matches ? "desktop" : "phone",
  );
  const [available, setAvailable] = useState<number | null>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const space = spaceRef.current;
    if (!space) return;
    const observer = new ResizeObserver(() => setAvailable(space.clientWidth));
    observer.observe(space);
    return () => observer.disconnect();
  }, []);
  const zoom = available === null ? 1 : Math.min(1, available / WIDTHS[width]);
  // The respond page's tabs: it opens on Availability when there is no description.
  const tabs = [
    { label: "Details", greyed: !hasDescription, selected: hasDescription },
    { label: "Availability", greyed: false, selected: !hasDescription },
    { label: "Questions", greyed: !hasQuestions, selected: false },
  ];

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-xs text-hint">
        The top of the respond page, as players see it, with what&rsquo;s in the box now.
      </p>
      <div role="group" aria-label="Preview width" className="flex gap-2">
        {(["desktop", "phone"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={width === option}
            onClick={() => setWidth(option)}
            className={`${SECONDARY_SM} aria-pressed:bg-selected`}
          >
            {option === "desktop" ? "Desktop" : "Phone"}
          </button>
        ))}
      </div>
      <div ref={spaceRef} className="w-full overflow-hidden">
        <div
          aria-hidden="true"
          inert
          style={{ zoom }}
          className={`rounded border border-edge bg-surface px-4 pt-8 ${width === "desktop" ? "w-192" : "w-97.5"}`}
        >
          <Pane as="div" className="mb-6">
            <h1 className="text-2xl font-semibold">{eventName}</h1>
            <ShortDescription text={text} />
          </Pane>
          <div className="window-tabs">
            <div className="window-tab-list">
              {tabs.map((tab) => (
                <span
                  key={tab.label}
                  className="window-tab"
                  aria-selected={tab.selected || undefined}
                  data-greyed={tab.greyed ? "" : undefined}
                >
                  {tab.label}
                </span>
              ))}
            </div>
          </div>
          {/* Only the sheet's top edge shows. */}
          <div className="h-7 overflow-hidden">
            <div className="window-sheet h-16" />
          </div>
        </div>
      </div>
      <p className="text-xs text-faint">
        {width === "desktop" ? "Desktop" : "Phone"}
        {zoom < 1 ? `, shown at ${Math.round(zoom * 100)}%` : ", actual size"}
      </p>
    </div>
  );
}

interface Props {
  /** The updateEventShortDescription server action, passed down from the page. */
  action: SaveAction;
  eventId: string;
  eventName: string;
  /** Whether the event has a saved full description; the slice's tabs follow it. */
  hasDescription: boolean;
  hasQuestions: boolean;
  initialText: string;
}

/** Short description editor on the event page, with its counter and a Reader Preview. */
export function ShortDescriptionForm({
  action,
  eventId,
  eventName,
  hasDescription,
  hasQuestions,
  initialText,
}: Props) {
  const [text, setText] = useState(initialText);
  const [savedText, setSavedText] = useState(initialText);
  const editorRef = useRef<MDXEditorMethods>(null);
  const length = shortDescriptionLength(text);
  const overCap = length > SHORT_DESCRIPTION_MAX_LENGTH;
  const dirty = text !== savedText;
  useUnsavedChangesGuard(() => dirty);
  const { formProps, confirmation, error, errorId } = useSaveForm({
    action,
    onSaved: (formData) => setSavedText(String(formData.get("shortDescription") ?? "")),
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
        <input type="hidden" name="shortDescription" value={text} />
        <div data-over-limit={overCap || undefined}>
          <ShortDescriptionEditor markdown={initialText} onChange={onChange} editorRef={editorRef} />
        </div>
        <p className={`text-xs ${overCap ? "text-error" : "text-faint"}`}>
          {length}/{SHORT_DESCRIPTION_MAX_LENGTH}
        </p>
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
        <ReaderPreview
          eventName={eventName}
          text={text}
          hasDescription={hasDescription}
          hasQuestions={hasQuestions}
        />
      </ReaderPreviewDisclosure>
    </>
  );
}
