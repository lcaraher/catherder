// Validation for the `next` parameter carried through login.

/**
 * Returns the path if it is a same-origin relative path: one leading slash,
 * no backslashes, no whitespace or control characters. Otherwise null.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\\\s\p{Cc}]/u.test(raw)) return null;
  // A URL parser must agree the target stays on this origin.
  try {
    const url = new URL(raw, "http://return-path.invalid");
    if (url.origin !== "http://return-path.invalid") return null;
    if (url.pathname + url.search + url.hash !== raw) return null;
  } catch {
    return null;
  }
  return raw;
}

/** Login URL that brings the person back to `next` afterwards, if it is safe. */
export function loginPathFor(next: string | null | undefined): string {
  const safe = safeReturnPath(next);
  return safe ? `/dev-login?next=${encodeURIComponent(safe)}` : "/dev-login";
}
