"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  BlockTypeSelect,
  Button,
  CreateLink,
  DiffSourceToggleWrapper,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  InsertTable,
  InsertThematicBreak,
  MDXEditor,
  TooltipWrap,
  activeEditor$,
  applyFormat$,
  applyListType$,
  codeBlockPlugin,
  codeMirrorPlugin,
  createRootEditorSubscription$,
  currentFormat$,
  currentListType$,
  currentSelection$,
  diffSourcePlugin,
  editorInTable$,
  headingsPlugin,
  iconComponentFor$,
  insertCodeBlock$,
  linkDialogPlugin,
  linkPlugin,
  lexical,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  realmPlugin,
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

type ListType = "bullet" | "number" | "check";

const LABELS: Record<string, string> = {
  "contentArea.editableMarkdown": "Description",
  "toolbar.link": "Link",
  "toolbar.table": "Table",
  "toolbar.thematicBreak": "Divider line",
  "toolbar.blockTypeSelect.selectBlockTypeTooltip": "Text style",
  "toolbar.blockTypeSelect.placeholder": "Text style",
  "toolbar.richText": "Formatted view",
  "toolbar.diffMode": "Changes since last save",
  "toolbar.source": "Markdown view",
};

// MDXEditor's text for `key`; its own default, placeholders filled, when we have none.
function translate(
  key: string,
  defaultValue: string,
  interpolations: Record<string, unknown> = {},
) {
  if (key === "toolbar.blockTypes.heading") {
    return interpolations.level === 3 ? "Subheading" : "Heading";
  }
  if (key in LABELS) return LABELS[key];
  return Object.entries(interpolations).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
    defaultValue,
  );
}

const TO_MARKDOWN_OPTIONS = { bullet: "-" } as const;

// Tab and Shift+Tab leave the editing area instead of indenting or inserting a tab.
const tabLeavesPlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) =>
      editor.registerCommand(lexical.KEY_TAB_COMMAND, () => true, lexical.COMMAND_PRIORITY_HIGH),
    );
  },
});

// A disabled button stays focusable, so its tooltip still shows on keyboard focus.
function ToolbarButton({
  label,
  tooltip = label,
  pressed,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  tooltip?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <TooltipWrap title={tooltip}>
      <Button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        className="description-editor-button"
      >
        {children}
      </Button>
    </TooltipWrap>
  );
}

function FormatButton({
  label,
  tooltip,
  format,
  flag,
  icon,
}: {
  label: string;
  tooltip?: string;
  format: "bold" | "italic" | "strikethrough" | "code";
  flag: number;
  icon: IconKey;
}) {
  const currentFormat = useCellValue(currentFormat$);
  const applyFormat = usePublisher(applyFormat$);
  const iconFor = useCellValue(iconComponentFor$);
  return (
    <ToolbarButton
      label={label}
      tooltip={tooltip}
      pressed={(currentFormat & flag) !== 0}
      onClick={() => applyFormat(format)}
    >
      {iconFor(icon)}
    </ToolbarButton>
  );
}

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
  return editor.read(() => {
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

function Toolbar() {
  return (
    <DiffSourceToggleWrapper>
      <FormatButton
        label="Bold"
        tooltip="Bold (Ctrl+B)"
        format="bold"
        flag={IS_BOLD}
        icon="format_bold"
      />
      <FormatButton
        label="Italic"
        tooltip="Italic (Ctrl+I)"
        format="italic"
        flag={IS_ITALIC}
        icon="format_italic"
      />
      <FormatButton
        label="Strikethrough"
        format="strikethrough"
        flag={IS_STRIKETHROUGH}
        icon="strikeThrough"
      />
      <FormatButton label="Inline code" format="code" flag={IS_CODE} icon="code" />
      <BlockTypeSelect />
      <ListButton label="Bulleted list" type="bullet" icon="format_list_bulleted" />
      <ListButton label="Numbered list" type="number" icon="format_list_numbered" />
      <ListButton label="Checklist" type="check" icon="format_list_checked" />
      <IndentButton />
      <IndentButton outdent />
      <CreateLink />
      <InsertTable />
      <InsertThematicBreak />
      <CodeBlockButton />
    </DiffSourceToggleWrapper>
  );
}

// Whether focus reached the editing area from the keyboard rather than a pointer.
function useKeyboardFocus() {
  const [on, setOn] = useState(false);
  const pointer = useRef(false);
  useEffect(() => {
    const down = () => (pointer.current = true);
    const key = () => (pointer.current = false);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, []);
  const isContent = (event: FocusEvent) =>
    (event.target as HTMLElement).classList.contains("description-editor-content");
  return {
    on,
    onFocus: (event: FocusEvent) => {
      if (isContent(event)) setOn(!pointer.current);
    },
    onBlur: (event: FocusEvent) => {
      if (isContent(event)) setOn(false);
    },
  };
}

interface Props {
  markdown: string;
  /** The text as last saved; "Changes since last save" compares with it. */
  savedMarkdown: string;
  onChange: (markdown: string, initialMarkdownNormalize: boolean) => void;
  editorRef: RefObject<MDXEditorMethods | null>;
}

/** The event description's formatted editor, with a Markdown view and a changes view. */
export function DescriptionEditor({ markdown, savedMarkdown, onChange, editorRef }: Props) {
  // Stable plugin parameters, so a re-render does not republish them.
  const plugins = useMemo(
    () => [
      headingsPlugin({ allowedHeadingLevels: [2, 3] }),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
      codeMirrorPlugin({ codeBlockLanguages: { "": "Plain text" } }),
      markdownShortcutPlugin(),
      diffSourcePlugin({ viewMode: "rich-text", diffMarkdown: savedMarkdown }),
      toolbarPlugin({ toolbarContents: () => <Toolbar /> }),
      tabLeavesPlugin(),
    ],
    [savedMarkdown],
  );

  const keyboardFocus = useKeyboardFocus();

  return (
    <div
      data-keyboard-focus={keyboardFocus.on || undefined}
      onFocus={keyboardFocus.onFocus}
      onBlur={keyboardFocus.onBlur}
    >
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
    </div>
  );
}
