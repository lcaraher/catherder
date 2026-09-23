import type { ReactNode } from "react";

/** A content pane: card surface, hairline edge, card radius. */
export function Pane({
  as: Tag = "section",
  className = "",
  children,
}: {
  as?: "section" | "div" | "fieldset";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={`rounded-card border border-edge bg-surface-card p-4 ${className}`}>
      {children}
    </Tag>
  );
}
