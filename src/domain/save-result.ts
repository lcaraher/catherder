/** What a form's server action reports: saved, or why not and which field caused it. */
export type SaveResult =
  | { ok: true }
  | { ok: false; message: string; field?: string };

/** Shown when a save throws on the server or never reaches it. */
export const SAVE_FAILED = "That didn't save. Try again.";

export function saved(): SaveResult {
  return { ok: true };
}

export function saveError(message: string, field?: string): SaveResult {
  return field === undefined ? { ok: false, message } : { ok: false, message, field };
}
