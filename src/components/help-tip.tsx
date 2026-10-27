"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// Smallest gap kept between the tooltip and either viewport edge, in px.
const EDGE_GAP = 8;

/** A "?" button explaining a setting in a tooltip on hover and keyboard focus; Escape closes it. */
export function HelpTip({ name, text }: { name: string; text: string }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const open = (hovered || focused) && !dismissed;

  // Nudges the tooltip back inside the viewport; the offset is added to the centring.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.marginLeft = "";
    if (!open) return;
    const rect = tip.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    let shift = 0;
    if (rect.right > viewport - EDGE_GAP) shift = viewport - EDGE_GAP - rect.right;
    if (rect.left + shift < EDGE_GAP) shift = EDGE_GAP - rect.left;
    if (shift !== 0) tip.style.marginLeft = `${shift}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={`What does ${name} do?`}
        aria-describedby={tipId}
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
        className="group inline-flex size-6 cursor-help items-center justify-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden="true"
          className="box-border flex size-4 items-center justify-center rounded-full border border-faint/50 text-help leading-none font-semibold text-faint group-hover:border-edge-strong group-hover:text-foreground group-focus-visible:border-edge-strong group-focus-visible:text-foreground"
        >
          ?
        </span>
      </button>
      {/* Always rendered, so the description is there while the tooltip is closed. */}
      <span
        ref={tipRef}
        id={tipId}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 mb-1 w-max max-w-60 -translate-x-1/2 rounded border border-edge bg-surface-raised px-2 py-1 text-xs whitespace-normal text-foreground ${open ? "block" : "hidden"}`}
      >
        {text}
      </span>
    </span>
  );
}
