"use client";

import { openInviteCode } from "@/app/join/actions";
import { PRIMARY } from "@/components/button-classes";
import { SaveMessage, useSaveForm } from "@/components/save-form";

/** The invite-code form on /join; a valid code opens its join page. */
export function JoinForm() {
  const { formProps, error, errorId, fieldProps } = useSaveForm({ action: openInviteCode });

  return (
    <form {...formProps} className="flex flex-col gap-3 text-sm">
      <label htmlFor="code" className="text-muted">
        Invite code
      </label>
      <input
        id="code"
        name="code"
        required
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCDE-FGHJK"
        {...fieldProps("code")}
        className="w-full rounded border border-edge-strong bg-field px-3 py-2 font-mono text-base tracking-wider aria-invalid:border-error"
      />
      <div>
        <button type="submit" className={PRIMARY}>
          Continue
        </button>
        <SaveMessage error={error} id={errorId} />
      </div>
    </form>
  );
}
