import type { ReactNode } from "react";

/** The container every legend sits in; children are its list items. */
export function Legend({
  label,
  className = "",
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ul
      aria-label={label}
      className={`inline-flex flex-wrap gap-x-5 gap-y-2 rounded border border-edge bg-surface-raised px-3 py-2 text-xs ${className}`}
    >
      {children}
    </ul>
  );
}
