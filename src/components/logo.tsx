// The only file that names logo artwork: a logo change is a swap here.
export type LogoVariant = "hanging";

// viewBox 320 × 380; width follows from the height.
const RATIO = 320 / 380;

/** The mark, drawn in currentColor at the given pixel height. */
export function Logo({
  variant = "hanging",
  size = 32,
  className = "",
}: {
  variant?: LogoVariant;
  size?: number;
  className?: string;
}) {
  void variant;
  return (
    <svg
      viewBox="0 0 320 380"
      width={Math.round(size * RATIO)}
      height={size}
      aria-hidden="true"
      className={className}
    >
      <rect
        x="100"
        y="54"
        width="120"
        height="150"
        rx="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="14"
      />
      <line x1="100" y1="88" x2="220" y2="88" stroke="currentColor" strokeWidth="14" />
      <circle cx="130" cy="54" r="10" fill="none" stroke="currentColor" strokeWidth="12" />
      <circle cx="190" cy="54" r="10" fill="none" stroke="currentColor" strokeWidth="12" />
      <g transform="translate(160,204)">
        <circle cx="-12" cy="0" r="9" fill="currentColor" />
        <circle cx="12" cy="0" r="9" fill="currentColor" />
        <line
          x1="-12"
          y1="2"
          x2="-12"
          y2="34"
          stroke="currentColor"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <line
          x1="12"
          y1="2"
          x2="12"
          y2="34"
          stroke="currentColor"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <circle cx="0" cy="48" r="22" fill="currentColor" />
        <polygon
          points="-20,-64 -24,-92 -6,-72"
          transform="translate(0,112)"
          fill="currentColor"
        />
        <polygon
          points="20,-64 24,-92 6,-72"
          transform="translate(0,112)"
          fill="currentColor"
        />
        <ellipse cx="0" cy="108" rx="26" ry="42" fill="currentColor" />
      </g>
      <g transform="translate(60,300)">
        <ellipse cx="0" cy="18" rx="24" ry="34" fill="currentColor" />
        <circle cx="0" cy="-28" r="19" fill="currentColor" />
        <polygon points="-17,-38 -21,-64 -4,-46" fill="currentColor" />
        <polygon points="17,-38 21,-64 4,-46" fill="currentColor" />
      </g>
      <g transform="translate(260,300) scale(-1,1)">
        <ellipse cx="0" cy="18" rx="24" ry="34" fill="currentColor" />
        <circle cx="0" cy="-28" r="19" fill="currentColor" />
        <polygon points="-17,-38 -21,-64 -4,-46" fill="currentColor" />
        <polygon points="17,-38 21,-64 4,-46" fill="currentColor" />
      </g>
    </svg>
  );
}
