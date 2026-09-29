"use client";

import { useEffect } from "react";
import { useConfirmation, useShowConfirmations } from "@/components/save-form";

const CONFIRM_MS = 2000;

/** "Event created" beside a new event's title for 2 s, then the marker leaves the address. */
export function CreatedNote() {
  const show = useShowConfirmations();
  const text = useConfirmation("created");

  useEffect(() => {
    show({ created: "Event created" });
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("created");
      window.history.replaceState(window.history.state, "", url);
    }, CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!text) return null;
  return (
    <span aria-hidden="true" className="text-sm text-status-submitted">
      {text} <span className="pop-in">✓</span>
    </span>
  );
}
