const CHIP =
  "ml-2 inline-block rounded border border-notice-warn-border bg-notice-warn px-2 py-px font-body text-xs font-medium text-notice-warn-text";

const WORDS = {
  changed: "Changed since you answered",
  new: "New since you answered",
} as const;

/** The respond page's note on a question changed or added since the viewer answered. */
export function QuestionMarkChip({ mark }: { mark: "changed" | "new" | null }) {
  if (mark === null) return null;
  return <span className={CHIP}>{WORDS[mark]}</span>;
}
