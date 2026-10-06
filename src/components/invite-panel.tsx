"use client";

import { Fragment, useState } from "react";
import { DANGER_SM, SECONDARY_SM } from "@/components/button-classes";
import { SaveButton, SaveMessage, useSaveForm, type SaveAction } from "@/components/save-form";

interface Props {
  eventId: string;
  /** Absolute join link, ready to share. */
  joinUrl: string;
  /** Display form of the code (XXXXX-XXXXX). */
  code: string;
  /** The regenerateInvite server action, passed down from the page. */
  regenerateAction: SaveAction;
}

// Heat step per code character, one to ten.
const TILE_CLASSES = [
  "bg-heat-1 text-heat-text-1",
  "bg-heat-1 text-heat-text-1",
  "bg-heat-2 text-heat-text-2",
  "bg-heat-2 text-heat-text-2",
  "bg-heat-3 text-heat-text-3",
  "bg-heat-3 text-heat-text-3",
  "bg-heat-4 text-heat-text-4",
  "bg-heat-4 text-heat-text-4",
  "bg-heat-5 text-heat-text-5",
  "bg-heat-5 text-heat-text-5",
];

function CopyButton({
  text,
  label,
  idleText = "Copy",
}: {
  text: string;
  label: string;
  idleText?: string;
}) {
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
          : idleText}
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
  const { formProps, confirmation, error, errorId } = useSaveForm({
    action: regenerateAction,
    beforeSubmit: () =>
      confirm(
        "Regenerate the invite? The current link and code stop working immediately, and you will need to share the new ones.",
      ),
  });

  return (
    <div className="flex flex-col gap-3 rounded border border-edge p-3 text-sm">
      <h3 className="-mb-0.5 self-start text-base leading-6 text-foreground heading-bar">
        Invite code
      </h3>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-tile-gap" aria-hidden="true">
          {[...code.replace("-", "")].map((char, i) => (
            <Fragment key={i}>
              {i === 5 && <span className="code-dash" />}
              <span className={`code-tile ${TILE_CLASSES[i]}`}>{char}</span>
            </Fragment>
          ))}
        </span>
        <span className="sr-only">{code}</span>
        <CopyButton text={code} label="Copy the invite code" idleText="Copy code" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 shrink-0 text-muted">Link</span>
        <code className="min-w-0 flex-1 truncate rounded bg-surface-raised px-2 py-1 text-xs">
          {joinUrl}
        </code>
        <CopyButton text={joinUrl} label="Copy the join link" />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-3">
        <form {...formProps}>
          <input type="hidden" name="eventId" value={eventId} />
          <SaveButton className={DANGER_SM} confirmText="Saved" confirmation={confirmation}>
            Regenerate
          </SaveButton>
          <SaveMessage error={error} id={errorId} />
        </form>
        <span className="text-xs text-hint">
          Works while this event is open.
        </span>
      </div>
    </div>
  );
}
