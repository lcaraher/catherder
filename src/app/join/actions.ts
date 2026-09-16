"use server";

import { redirect } from "next/navigation";
import { normalizeInviteCode } from "@/domain/invites";

// Turns the typed code into its /join/[code] URL; the page does the redeeming.
export async function openInviteCode(formData: FormData) {
  const code = normalizeInviteCode(String(formData.get("code") ?? ""));
  if (!code) {
    redirect(
      `/join?error=${encodeURIComponent(
        "Enter the 10-character code, like ABCDE-FGHJK.",
      )}`,
    );
  }
  redirect(`/join/${code}`);
}
