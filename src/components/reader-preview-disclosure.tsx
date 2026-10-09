"use client";

import { useState, type ReactNode } from "react";

/** The "Reader Preview" disclosure under an editor's form; its content mounts when first opened. */
export function ReaderPreviewDisclosure({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="group border-t border-edge pt-3"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="summary-plain flex cursor-pointer items-center gap-2 rounded bg-badge-organizer px-2.5 py-1.5 font-small text-sm font-medium text-badge-organizer-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 shrink-0 transition-transform duration-160 group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        Reader Preview
      </summary>
      {opened && children}
    </details>
  );
}
