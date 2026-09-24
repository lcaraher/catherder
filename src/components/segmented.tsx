"use client";

import type { CSSProperties, ReactNode } from "react";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  title?: string;
}

interface Props {
  /** Accessible name of the whole control. */
  label: string;
  options: SegmentedOption[];
  value: string;
  /** Client mode: the segments are radios and this receives the new value. */
  onChange?: (value: string) => void;
  /** Form mode: each segment submits `name=value` to the action. */
  action?: (formData: FormData) => void | Promise<void>;
  name?: string;
  /** Form mode only: hidden inputs the action needs. */
  children?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A row of two or more equal-width segments with one active. The accent fill
 * sits behind the labels and slides to the active segment.
 */
export function Segmented({
  label,
  options,
  value,
  onChange,
  action,
  name,
  children,
  size = "md",
  className = "",
}: Props) {
  const group = `segmented overflow-hidden rounded border border-edge-strong ${
    size === "sm" ? "text-xs" : "text-sm"
  } ${className}`;
  const segment = (active: boolean) =>
    `relative z-10 inline-flex items-center justify-center gap-1.5 ${size === "sm" ? "px-2 py-1" : "px-3 py-1"} ${FOCUS_RING} ${
      active ? "text-on-primary" : "hover:bg-btn-secondary-hover"
    }`;
  const index = options.findIndex((option) => option.value === value);
  const groupStyle = { "--n": options.length } as CSSProperties;
  const highlight = index >= 0 && (
    <span
      aria-hidden="true"
      className="segmented-highlight accent-gradient-fill"
      style={{ "--index": index } as CSSProperties}
    />
  );

  if (action) {
    return (
      <form
        action={action}
        className={group}
        style={groupStyle}
        aria-label={label}
      >
        {children}
        {highlight}
        {options.map((option) => (
          <button
            key={option.value}
            type="submit"
            name={name}
            value={option.value}
            aria-pressed={option.value === value}
            title={option.title}
            className={segment(option.value === value)}
          >
            {option.label}
          </button>
        ))}
      </form>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={group}
      style={groupStyle}
    >
      {highlight}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          onClick={() => onChange?.(option.value)}
          className={segment(option.value === value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
