// Line-drawn eye / crossed-out eye for the answer visibility switch.
export function EyeIcon({ open, className = "h-3.5 w-3.5" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" />
      <circle cx="8" cy="8" r="2" />
      {!open && <line x1="3" y1="13.5" x2="13" y2="2.5" />}
    </svg>
  );
}
