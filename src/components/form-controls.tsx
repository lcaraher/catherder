import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const CONTROL = `appearance-none shrink-0 border-control border-edge-strong bg-field disabled:opacity-50 ${FOCUS_RING}`;

/** A native checkbox drawn from tokens; the mark comes from control-check. */
export function Checkbox(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">,
) {
  return (
    <input
      type="checkbox"
      className={`${CONTROL} control-check size-4 rounded checked:border-btn-primary checked:bg-btn-primary`}
      {...props}
    />
  );
}

/** A native radio drawn from tokens; the dot comes from control-dot. */
export function Radio(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">,
) {
  return (
    <input
      type="radio"
      className={`${CONTROL} control-dot size-4 rounded-full checked:border-btn-primary`}
      {...props}
    />
  );
}

/**
 * A native select with its own chevron. className sizes the select itself;
 * wrapperClassName sizes the wrapper (pass "w-full" for a full-width field).
 */
export function Select({
  className = "",
  wrapperClassName = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <span className={`relative inline-block ${wrapperClassName}`}>
      <select
        className={`${CONTROL} w-full rounded pr-8 ${className}`}
        {...props}
      />
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-hint"
        aria-hidden="true"
      >
        <path d="M4 6 L8 10 L12 6" />
      </svg>
    </span>
  );
}
