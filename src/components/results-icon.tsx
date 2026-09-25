/** Four-square icon for the shared-results link. */
export function ResultsIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" opacity="0.6" />
      <rect x="2" y="9" width="5" height="5" rx="1" opacity="0.6" />
      <rect x="9" y="9" width="5" height="5" rx="1" opacity="0.35" />
    </svg>
  );
}
