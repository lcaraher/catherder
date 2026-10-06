"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

// Smallest gap kept between the tooltip and either viewport edge, in px.
const EDGE_GAP = 8;

type Props = {
  /** The button's accessible name and the tooltip's text. */
  label: string;
  className?: string;
  children: ReactNode;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "className" | "children" | "onMouseEnter" | "onMouseLeave" | "onFocus" | "onBlur"
>;

/** A button whose label is also a tooltip on hover and keyboard focus; Escape closes it. */
export function TipButton({ label, className, children, ...rest }: Props) {
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
        {...rest}
        aria-label={label}
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
        className={className}
      >
        {children}
      </button>
      {open && (
        <span
          ref={tipRef}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 mb-1 block -translate-x-1/2 rounded border border-edge bg-surface-raised px-2 py-1 text-xs whitespace-nowrap text-foreground"
        >
          {label}
        </span>
      )}
    </span>
  );
}
