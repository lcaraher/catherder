"use client";

import { useEffect, useRef } from "react";
import { createUnsavedChangesGuard } from "@/components/unsaved-changes-guard";

let pageGuard: ReturnType<typeof createUnsavedChangesGuard> | null = null;

/**
 * Warns before leaving while isDirty() is true: beforeunload for browser
 * navigation, window.confirm for in-app link clicks. Never saves anything.
 * Every form on the page shares one warning.
 */
export function useUnsavedChangesGuard(isDirty: () => boolean) {
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  });

  useEffect(() => {
    pageGuard ??= createUnsavedChangesGuard({
      window,
      document,
      confirm: (message) => window.confirm(message),
    });
    return pageGuard.register(isDirtyRef);
  }, []);
}
