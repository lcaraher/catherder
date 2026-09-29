import type { ReactNode } from "react";

/** A content pane: card surface, hairline edge, card radius. */
export function Pane({
  as: Tag = "section",
  id,
  className = "",
  children,
}: {
  as?: "section" | "div" | "fieldset";
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag id={id} className={`rounded-card border border-edge bg-surface-card p-4 ${className}`}>
      {children}
    </Tag>
  );
}
