"use client";

import { useEffect, useRef } from "react";

const MESSAGE =
  "You have unsaved changes that will be lost if you leave this page.";

/**
 * Warns before leaving while isDirty() is true: beforeunload for browser
 * navigation, window.confirm for in-app link clicks. Never saves anything.
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
