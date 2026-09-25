"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const TEXT = "Shown to the nearest half hour";
// Smallest gap kept between the tooltip and either viewport edge, in px.
const EDGE_GAP = 8;

/**
 * Clock icon marking a zone the grid rounds to the half hour. The sentence is
 * the accessible name and also a tooltip on hover and keyboard focus.
 */
export function HalfHourNote() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);
  const open = (hovered || focused) && !dismissed;

  // Nudges the tooltip back inside the viewport; the offset is added to the centring.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!open || !tip) return;
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
        aria-label={TEXT}
        title={TEXT}
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
        className="inline-flex rounded text-hint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.75 V8 L10.25 9.5" />
        </svg>
      </button>
      {open && (
        <span
          ref={tipRef}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 mb-1 block -translate-x-1/2 rounded border border-edge bg-surface-raised px-2 py-1 text-xs whitespace-nowrap text-foreground"
        >
          {TEXT}
        </span>
      )}
    </span>
  );
}
