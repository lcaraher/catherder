"use client";

import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import {
  Button,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  TooltipWrap,
  applyFormat$,
  createRootEditorSubscription$,
  currentFormat$,
  iconComponentFor$,
  lexical,
  openLinkEditDialog$,
  realmPlugin,
  useCellValue,
  usePublisher,
  type IconKey,
} from "@mdxeditor/editor";

/** MDXEditor's text lookup: our label for `key`, else its default with placeholders filled. */
export function translateWith(labels: Record<string, string>) {
  return (key: string, defaultValue: string, interpolations: Record<string, unknown> = {}) => {
    if (key in labels) return labels[key];
    return Object.entries(interpolations).reduce(
      (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
      defaultValue,
    );
  };
}

// Tab and Shift+Tab leave the editing area instead of indenting or inserting a tab.
export const tabLeavesPlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) =>
      editor.registerCommand(lexical.KEY_TAB_COMMAND, () => true, lexical.COMMAND_PRIORITY_HIGH),
    );
  },
});

// A disabled button stays focusable, so its tooltip still shows on keyboard focus.
export function ToolbarButton({
  label,
  tooltip = label,
  pressed,
  disabled = false,
  keepSelection = false,
  onClick,
  children,
}: {
  label: string;
  tooltip?: string;
  pressed?: boolean;
  disabled?: boolean;
  /** Pressing it leaves focus and the text selection in the editing area. */
  keepSelection?: boolean;
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
        onPointerDown={keepSelection ? (event) => event.preventDefault() : undefined}
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

/** Bold, Italic, Strikethrough and Inline code, in that order. */
export function FormatButtons() {
  return (
    <>
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
    </>
  );
}

/** Opens MDXEditor's link dialog for the selection, as its CreateLink does. */
export function LinkButton() {
  const openLinkDialog = usePublisher(openLinkEditDialog$);
  const iconFor = useCellValue(iconComponentFor$);
  return (
    <ToolbarButton label="Link" keepSelection onClick={() => openLinkDialog()}>
      {iconFor("link")}
    </ToolbarButton>
  );
}

// Whether focus reached the editing area from the keyboard rather than a pointer.
export function useKeyboardFocus() {
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
