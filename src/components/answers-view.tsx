"use client";

import { useState, type ReactNode } from "react";
import { Segmented } from "@/components/segmented";

interface Props {
  totals: ReactNode;
  each: ReactNode;
}

/** A question's answers as totals or per person, switched in place; totals on every load. */
export function AnswersView({ totals, each }: Props) {
  const [view, setView] = useState("totals");

  return (
    <>
      <Segmented
        label="Answers view"
        size="sm"
        className="mb-3"
        options={[
          { value: "totals", label: "Totals" },
          { value: "each", label: "Each person" },
        ]}
        value={view}
        onChange={setView}
      />
      {view === "each" ? each : totals}
    </>
  );
}
