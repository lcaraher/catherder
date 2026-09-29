"use client";

import { useEffect, useId, useState } from "react";
import { DecodeLabel } from "@/components/decode-label";

/** Disabled "Support the wolfcat" label with a "Coming soon" note on hover and keyboard focus. */
export function SupportNote() {
  const noteId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused) && !dismissed;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <span className="relative ml-3 inline-block">
      <span
        tabIndex={0}
        aria-disabled="true"
        aria-describedby={noteId}
        onMouseEnter={() => {
          setHovered(true);
          setDismissed(false);
        }}
        onMouseLeave={() => setHovered(false)}
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible")) return;
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => setFocused(false)}
        className="pixel-pointer cursor-not-allowed whitespace-nowrap opacity-60"
      >
        <DecodeLabel text="Support the wolfcat" />
      </span>
      <span
        id={noteId}
        role="tooltip"
        hidden={!open}
        className="pointer-events-none absolute bottom-full left-0 mb-1 rounded border border-edge-strong bg-surface px-2 py-1 font-body text-xs whitespace-nowrap text-foreground"
      >
        Coming soon
      </span>
    </span>
  );
}
