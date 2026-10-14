"use client";

import { useMemo, type RefObject } from "react";
import {
  BlockTypeSelect,
  DiffSourceToggleWrapper,
  InsertTable,
  InsertThematicBreak,
  MDXEditor,
  activeEditor$,
  applyListType$,
  codeBlockPlugin,
  codeMirrorPlugin,
  currentListType$,
  currentSelection$,
  diffSourcePlugin,
  editorInTable$,
  headingsPlugin,
  iconComponentFor$,
  imagePlugin,
  insertCodeBlock$,
  linkDialogPlugin,
  linkPlugin,
  lexical,
  listsPlugin,
  markdownShortcutPlugin,
  openNewImageDialog$,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  useCellValue,
  useCellValues,
  usePublisher,
  type IconKey,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import {
  FormatButtons,
  LinkButton,
  ToolbarButton,
  tabLeavesPlugin,
  translateWith,
  useKeyboardFocus,
} from "@/components/editor-parts";
import { PictureDialog, PictureEventContext } from "@/components/picture-dialog";
import { uploadPicture, type UploadStage } from "@/components/picture-upload";
import { imageAddress } from "@/domain/images";

type ListType = "bullet" | "number" | "check";

const LABELS: Record<string, string> = {
  "contentArea.editableMarkdown": "Description",
  "toolbar.table": "Table",
  "toolbar.thematicBreak": "Divider line",
  "toolbar.blockTypeSelect.selectBlockTypeTooltip": "Text style",
  "toolbar.blockTypeSelect.placeholder": "Text style",
  "toolbar.richText": "Formatted view",
  "toolbar.diffMode": "Changes since last save",
  "toolbar.source": "Markdown view",
};

const translateLabel = translateWith(LABELS);

// MDXEditor's text for `key`, with the two heading levels named.
function translate(key: string, defaultValue: string, interpolations: Record<string, unknown> = {}) {
  if (key === "toolbar.blockTypes.heading") {
    return interpolations.level === 3 ? "Subheading" : "Heading";
  }
  return translateLabel(key, defaultValue, interpolations);
}

const TO_MARKDOWN_OPTIONS = { bullet: "-" } as const;

function ListButton({ label, type, icon }: { label: string; type: ListType; icon: IconKey }) {
  const [currentListType, inTable, iconFor] = useCellValues(
    currentListType$,
    editorInTable$,
    iconComponentFor$,
  );
  const applyListType = usePublisher(applyListType$);
  const on = currentListType === type;
  return (
    <ToolbarButton
      label={label}
      pressed={on}
      disabled={inTable}
      onClick={() => applyListType(on ? "" : type)}
    >
      {iconFor(icon)}
    </ToolbarButton>
  );
}

// MDXEditor has no indent icons; these match its 24px toolbar glyphs.
function IndentIcon({ outdent = false }: { outdent?: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5.5h16M11 10h9M11 14h9M4 18.5h16" />
      <path d={outdent ? "M7.5 9 4 12l3.5 3" : "M4 9l3.5 3L4 15"} />
    </svg>
  );
}

// Whether the cursor is in the first item of a list, which has no item above to nest under.
function inFirstListItem(editor: lexical.LexicalEditor | null): boolean {
  if (!editor) return false;
  // "latest" reads the committed state; the default would flush pending updates during render.
  return editor.read("latest", () => {
    const selection = lexical.$getSelection();
    if (!lexical.$isRangeSelection(selection)) return false;
    let node: lexical.LexicalNode | null = selection.anchor.getNode();
    while (node && node.getType() !== "listitem") node = node.getParent();
    return node !== null && node.getPreviousSibling() === null;
  });
}

// Indent and outdent apply to list items only; Markdown cannot carry an indented paragraph.
function IndentButton({ outdent = false }: { outdent?: boolean }) {
  const [currentListType, inTable, editor] = useCellValues(
    currentListType$,
    editorInTable$,
    activeEditor$,
  );
  // Re-renders as the cursor moves, so the first-item check stays current.
  useCellValue(currentSelection$);
  const command = outdent ? lexical.OUTDENT_CONTENT_COMMAND : lexical.INDENT_CONTENT_COMMAND;
  return (
    <ToolbarButton
      label={outdent ? "Outdent list item" : "Indent list item"}
      disabled={currentListType === "" || inTable || (!outdent && inFirstListItem(editor))}
      onClick={() => editor?.dispatchCommand(command, undefined)}
    >
      <IndentIcon outdent={outdent} />
    </ToolbarButton>
  );
}

function CodeBlockButton() {
  const insertCodeBlock = usePublisher(insertCodeBlock$);
  const iconFor = useCellValue(iconComponentFor$);
  return (
    <ToolbarButton label="Code block" onClick={() => insertCodeBlock({})}>
      {iconFor("frame_source")}
    </ToolbarButton>
  );
}

function PictureButton() {
  const openNewImageDialog = usePublisher(openNewImageDialog$);
  const iconFor = useCellValue(iconComponentFor$);
  return (
    <ToolbarButton label="Picture" onClick={() => openNewImageDialog()}>
      {iconFor("add_photo")}
    </ToolbarButton>
  );
}

const PICTURE_SRC = /^img:([a-z0-9]{1,40})$/;

function Toolbar() {
  return (
    <DiffSourceToggleWrapper>
      <FormatButtons />
      <BlockTypeSelect />
      <ListButton label="Bulleted list" type="bullet" icon="format_list_bulleted" />
      <ListButton label="Numbered list" type="number" icon="format_list_numbered" />
      <ListButton label="Checklist" type="check" icon="format_list_checked" />
      <IndentButton />
      <IndentButton outdent />
      <LinkButton />
      <PictureButton />
      <InsertTable />
      <InsertThematicBreak />
      <CodeBlockButton />
    </DiffSourceToggleWrapper>
  );
}

interface Props {
  markdown: string;
  /** The text as last saved; "Changes since last save" compares with it. */
  savedMarkdown: string;
  onChange: (markdown: string, initialMarkdownNormalize: boolean) => void;
  editorRef: RefObject<MDXEditorMethods | null>;
  eventId: string;
  /** Called with a pasted or dropped picture's refusal, and with null when the next one starts. */
  onPictureRefused: (message: string | null) => void;
  /** Starts following one pasted or dropped picture's upload. */
  trackPictureUpload: () => PictureUploadTracker;
}

export interface PictureUploadTracker {
  stage: (stage: UploadStage) => void;
  end: () => void;
}

/** The event description's formatted editor, with a Markdown view and a changes view. */
export function DescriptionEditor({
  markdown,
  savedMarkdown,
  onChange,
  editorRef,
  eventId,
  onPictureRefused,
  trackPictureUpload,
}: Props) {
  // Stable plugin parameters, so a re-render does not republish them.
  const plugins = useMemo(
    () => [
      headingsPlugin({ allowedHeadingLevels: [2, 3] }),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      imagePlugin({
        // Resizing would write an HTML tag, which the page shows as text.
        disableImageResize: true,
        ImageDialog: PictureDialog,
        // Only the event's own pictures load; any other address loads nothing.
        imagePreviewHandler: async (src) => {
          const match = PICTURE_SRC.exec(src);
          return match ? imageAddress(eventId, match[1]) : "";
        },
        // Pasted and dropped pictures; a refusal never settles, as MDXEditor rethrows a rejection.
        // MDXEditor waits for every picture in one paste or drop, so if one is refused none of them is inserted.
        imageUploadHandler: (file) =>
          new Promise<string>((resolve) => {
            onPictureRefused(null);
            const upload = trackPictureUpload();
            void uploadPicture(eventId, file, upload.stage).then((outcome) => {
              upload.end();
              if (outcome.ok) resolve(outcome.src);
              else onPictureRefused(outcome.message);
            });
          }),
      }),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
      codeMirrorPlugin({ codeBlockLanguages: { "": "Plain text" } }),
      markdownShortcutPlugin(),
      diffSourcePlugin({ viewMode: "rich-text", diffMarkdown: savedMarkdown }),
      toolbarPlugin({ toolbarContents: () => <Toolbar /> }),
      tabLeavesPlugin(),
    ],
    [savedMarkdown, eventId, onPictureRefused, trackPictureUpload],
  );

  const keyboardFocus = useKeyboardFocus();

  return (
    <div
      data-keyboard-focus={keyboardFocus.on || undefined}
      onFocus={keyboardFocus.onFocus}
      onBlur={keyboardFocus.onBlur}
    >
      <PictureEventContext value={eventId}>
        <MDXEditor
          ref={editorRef}
          className="description-editor"
          contentEditableClassName="description-editor-content"
          markdown={markdown}
          onChange={onChange}
          plugins={plugins}
          toMarkdownOptions={TO_MARKDOWN_OPTIONS}
          translation={translate}
        />
      </PictureEventContext>
    </div>
  );
}
