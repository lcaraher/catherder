"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { SECONDARY_SM } from "@/components/button-classes";

const SEEN_KEY = "catherder-theme-pointer-seen";
// Screen margin, and where the arrow's tip and tail sit in its 44 × 40 box.
const MARGIN = 8;
const TIP = { x: 8, y: 6 };
const TAIL_X = 40;
const ARROW_WIDTH = 44;
const DROP = 30;

type Place = { boxX: number; boxY: number; arrowX: number; mirrored: boolean };

// True when the note was seen or storage is unavailable; the server never shows it.
function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return true;
  }
}
const noSubscribe = () => () => {};

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {}
}

/** A one-time note under the theme button, with an arrow pointing at it. */
export function ThemePointer({ targetId }: { targetId: string }) {
  const seen = useSyncExternalStore(noSubscribe, readSeen, () => true);
  const [dismissed, setDismissed] = useState(false);
  const show = !seen && !dismissed;
  const [place, setPlace] = useState<Place | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!show) return;
    const target = document.getElementById(targetId);
    if (!target) return;

    function measure() {
      if (!target || !box.current) return;
      const button = target.getBoundingClientRect();
      const width = box.current.offsetWidth;
      const screen = document.documentElement.clientWidth;
      const tipY = button.bottom - 3;
      // Tip on the button's left third; mirrored when the tail would run off the right.
      let mirrored = false;
      let tipX = button.left + button.width / 3;
      if (tipX - TIP.x + TAIL_X + 16 > screen - MARGIN) {
        mirrored = true;
        tipX = button.right - button.width / 3;
      }
      const arrowLeft = mirrored ? tipX - (ARROW_WIDTH - TIP.x) : tipX - TIP.x;
      const tailX = mirrored ? arrowLeft + ARROW_WIDTH - TAIL_X : arrowLeft + TAIL_X;
      const preferred = mirrored ? tailX + 16 - width : tailX - 16;
      const boxX = Math.min(Math.max(preferred, MARGIN), screen - MARGIN - width);
      setPlace({ boxX, boxY: tipY + DROP, arrowX: arrowLeft - boxX, mirrored });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [show, targetId]);

  useEffect(() => {
    if (!show) return;
    const target = document.getElementById(targetId);
    const dismiss = () => {
      markSeen();
      setDismissed(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    target?.addEventListener("click", dismiss);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      target?.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [show, targetId]);

  if (!show) return null;

  function gotIt() {
    const hadFocus = box.current?.contains(document.activeElement);
    markSeen();
    setDismissed(true);
    if (hadFocus) document.getElementById(targetId)?.focus();
  }

  return (
    <div
      ref={box}
      role="note"
      style={
        place
          ? ({
              "--note-x": `${place.boxX}px`,
              "--note-y": `${place.boxY}px`,
              "--arrow-x": `${place.arrowX}px`,
            } as React.CSSProperties)
          : undefined
      }
      className={`pointer-note z-40 flex w-44 flex-col items-start gap-2 rounded-card border border-edge bg-surface-card p-3 text-foreground ${
        place ? "" : "invisible"
      }`}
    >
      <svg
        aria-hidden="true"
        className={`pointer-arrow h-10 w-11 ${place?.mirrored ? "-scale-x-100" : ""}`}
        viewBox="0 0 44 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M40 36 C 26 34, 12 26, 8 8" />
        <path d="M3 14 L8 6 L14 13" />
      </svg>
      <p className="font-wordmark text-base font-extrabold">pick a theme here!</p>
      <button type="button" onClick={gotIt} className={SECONDARY_SM}>
        Got it
      </button>
    </div>
  );
}
