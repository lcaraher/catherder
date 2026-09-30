import type { CSSProperties } from "react";

const WORDMARK = "catherder";

/** The name for screen readers plus one hidden span per letter for letter-hop. */
export function Wordmark() {
  return (
    <>
      <span className="sr-only">{WORDMARK}</span>
      {[...WORDMARK].map((letter, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ "--i": i } as CSSProperties}
        >
          {letter}
        </span>
      ))}
    </>
  );
}
