"use server";

import { redirect } from "next/navigation";
import { normalizeInviteCode } from "@/domain/invites";
import { saveError, type SaveResult } from "@/domain/save-result";

// Turns the typed code into its /join/[code] URL; the page does the redeeming.
export async function openInviteCode(formData: FormData): Promise<SaveResult> {
  const code = normalizeInviteCode(String(formData.get("code") ?? ""));
  if (!code) {
    return saveError("Enter the 10-character code, like ABCDE-FGHJK.", "code");
  }
  redirect(`/join/${code}`);
}
