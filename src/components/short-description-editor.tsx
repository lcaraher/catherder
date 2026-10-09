"use client";

import { useMemo, type RefObject } from "react";
import {
  MDXEditor,
  linkDialogPlugin,
  linkPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import {
  FormatButtons,
  LinkButton,
  tabLeavesPlugin,
  translateWith,
  useKeyboardFocus,
} from "@/components/editor-parts";

const translate = translateWith({ "contentArea.editableMarkdown": "Short description" });

function Toolbar() {
  return (
    <>
      <FormatButtons />
      <LinkButton />
    </>
  );
}

interface Props {
  markdown: string;
  onChange: (markdown: string, initialMarkdownNormalize: boolean) => void;
  editorRef: RefObject<MDXEditorMethods | null>;
}

/** The short description's formatted editor: inline formatting and links only. */
export function ShortDescriptionEditor({ markdown, onChange, editorRef }: Props) {
  const plugins = useMemo(
    () => [
      linkPlugin(),
      linkDialogPlugin(),
      markdownShortcutPlugin(),
      toolbarPlugin({ toolbarContents: () => <Toolbar /> }),
      tabLeavesPlugin(),
    ],
    [],
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
        className="description-editor short-description-editor"
        contentEditableClassName="description-editor-content"
        markdown={markdown}
        onChange={onChange}
        plugins={plugins}
        translation={translate}
      />
    </div>
  );
}
