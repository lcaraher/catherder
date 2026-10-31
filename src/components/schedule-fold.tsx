"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { SECONDARY_SM } from "@/components/button-classes";
import { EyeIcon } from "@/components/eye-icon";
import { TipButton } from "@/components/tip-button";

const HIDDEN_KEY = "catherder-schedule-hidden";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// True unless this browser folded the schedule; a storage error reads as open.
function readOpen() {
  try {
    return localStorage.getItem(HIDDEN_KEY) !== "1";
  } catch {
    return true;
  }
}

function storeOpen(open: boolean) {
  try {
    if (open) localStorage.removeItem(HIDDEN_KEY);
    else localStorage.setItem(HIDDEN_KEY, "1");
  } catch {}
  listeners.forEach((listener) => listener());
}

/** The Playdates schedule with its legend, foldable away behind one eye button. */
export function ScheduleFold({ children }: { children: ReactNode }) {
  const open = useSyncExternalStore(subscribe, readOpen, () => true);
  const boxId = useId();

  return (
    <>
      <div className={`flex items-center ${open ? "mb-1.5" : "mb-3"}`}>
        <p className="font-small text-xs font-medium text-muted">Schedule</p>
        <div className="ml-2 flex">
          <TipButton
            label={open ? "Hide schedule" : "Show schedule"}
            aria-expanded={open}
            aria-controls={boxId}
            onClick={() => storeOpen(!open)}
            className={`${SECONDARY_SM} inline-flex items-center`}
          >
            <EyeIcon open={open} className="h-4 w-4" />
          </TipButton>
        </div>
      </div>
      {open && <div id={boxId}>{children}</div>}
    </>
  );
}
