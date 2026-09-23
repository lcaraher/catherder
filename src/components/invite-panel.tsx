"use client";

import { useState } from "react";
import { DANGER_SM, SECONDARY_SM } from "@/components/button-classes";

interface Props {
  eventId: string;
  /** Absolute join link, ready to share. */
  joinUrl: string;
  /** Display form of the code (XXXXX-XXXXX). */
  code: string;
  /** The regenerateInvite server action, passed down from the page. */
  regenerateAction: (formData: FormData) => void | Promise<void>;
}


function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className={SECONDARY_SM}
    >
      {state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Select and copy"
          : "Copy"}
    </button>
  );
}

/** Organizer's invite panel: link and code with copy buttons, plus a confirmed regenerate. */
export function InvitePanel({
  eventId,
  joinUrl,
  code,
  regenerateAction,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded border border-edge p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 shrink-0 text-muted">Link</span>
        <code className="min-w-0 flex-1 truncate rounded bg-surface-raised px-2 py-1 text-xs">
          {joinUrl}
        </code>
        <CopyButton text={joinUrl} label="Copy the join link" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 shrink-0 text-muted">Code</span>
        <code className="rounded bg-surface-raised px-2 py-1 font-mono text-base tracking-wider">
          {code}
        </code>
        <CopyButton text={code} label="Copy the invite code" />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-3">
        <form
          action={regenerateAction}
          onSubmit={(event) => {
            if (
              !confirm(
                "Regenerate the invite? The current link and code stop working immediately, and you will need to share the new ones.",
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="eventId" value={eventId} />
          <button
            type="submit"
            className={DANGER_SM}
          >
            Regenerate
          </button>
        </form>
        <span className="text-xs text-hint">
          Works while this event is open.
        </span>
      </div>
    </div>
  );
}
