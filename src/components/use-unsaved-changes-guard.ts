"use client";

import { useEffect, useRef } from "react";

const MESSAGE =
  "You have unsaved changes that will be lost if you leave this page.";

/**
 * Warns before the page is left while `isDirty()` returns true: the standard
 * beforeunload dialog for browser navigation (close, reload, address bar) and
 * a window.confirm for in-app link clicks. Nothing is ever saved on the
 * user's behalf.
 *
 * `isDirty` is a callback, not a boolean, so parents that track form state in
 * refs (to avoid re-rendering on every grid paint stroke) can still be
 * guarded — it is read at event time, never at render time.
 *
 * Link clicks are intercepted with a capture-phase listener on `document`,
 * which runs before React's own root listener: stopPropagation there keeps
 * next/link's client-side navigation handler from ever firing, and
 * preventDefault covers plain anchors.
 */
export function useUnsavedChangesGuard(isDirty: () => boolean) {
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  });

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirtyRef.current()) return;
      event.preventDefault();
      // Legacy channel some browsers still require; the text shown is theirs.
      event.returnValue = MESSAGE;
    }

    function onClickCapture(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      // Modified clicks open elsewhere and leave this page alone.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target !== "" && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.getAttribute("href")?.startsWith("#")) return;
      if (!isDirtyRef.current()) return;
      if (!window.confirm(`${MESSAGE} Leave anyway?`)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, []);
}
