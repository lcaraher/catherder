// Pure invite-code rules: generation, normalization, display, redemption.

import { randomBytes } from "node:crypto";

// Crockford base32: digits and upper-case letters without I, L, O, U.
export const INVITE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const INVITE_CODE_LENGTH = 10;

export type EventStatus = "DRAFT" | "OPEN" | "CLOSED";

/** One byte per character onto the alphabet; 256 is a multiple of 32, so no bias. */
export function inviteCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < INVITE_CODE_LENGTH) {
    throw new Error(`need at least ${INVITE_CODE_LENGTH} bytes`);
  }
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
  }
  return code;
}

/** A fresh canonical code; `random` is injectable for tests. */
export function generateInviteCode(
  random: (size: number) => Uint8Array = randomBytes,
): string {
  return inviteCodeFromBytes(random(INVITE_CODE_LENGTH));
}

/**
 * Canonical form of a typed code: upper-cased, hyphens and whitespace
 * dropped. Null when what remains is not exactly 10 alphabet characters.
 */
export function normalizeInviteCode(input: string): string | null {
  const stripped = input.replace(/[\s-]+/g, "").toUpperCase();
  if (stripped.length !== INVITE_CODE_LENGTH) return null;
  for (const char of stripped) {
    if (!INVITE_CODE_ALPHABET.includes(char)) return null;
  }
  return stripped;
}

/** Display form: XXXXX-XXXXX. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** A code works only while its event is OPEN and not archived. */
export function canRedeemInvite({
  eventStatus,
  archivedAt,
}: {
  eventStatus: EventStatus;
  archivedAt: Date | null;
}): boolean {
  return eventStatus === "OPEN" && archivedAt === null;
}
