// Sentence-case words for the status enums; the enum values stay in code.
const LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  INVITED: "Invited",
  DRAFT: "Draft",
  OPEN: "Open",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

/** The word shown for a status value; unknown values are sentence-cased. */
export function statusLabel(status: string): string {
  return (
    LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase()
  );
}
