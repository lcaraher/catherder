"use client";

import { useEffect, useRef, useState } from "react";
import { THEME_NAMES, type Theme } from "@/domain/theme";
import { SECONDARY_SM } from "@/components/button-classes";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// Repaints the page in a theme without a server round trip.
function applyTheme(value: Theme) {
  document.documentElement.dataset.theme = value;
}

/**
 * A Theme button that opens a list of every theme. A choice applies at once
 * and is saved in the background.
 */
export function ThemeControls({
  initialTheme,
  themes,
  opens,
}: {
  initialTheme: Theme;
  themes: readonly Theme[];
  opens: "down" | "up";
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // Presses while a save is in flight are ignored; nothing is disabled.
  async function save(value: Theme) {
    if (saving.current || value === theme) return;
    saving.current = true;
    const previous = theme;
    applyTheme(value);
    setTheme(value);
    setError("");
    try {
      const response = await fetch("/api/me/theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: value }),
      });
      if (!response.ok) throw new Error(`save failed (${response.status})`);
    } catch {
      applyTheme(previous);
      setTheme(previous);
      setError("Could not save the theme. Try again.");
    }
    saving.current = false;
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function choose(value: Theme) {
    close(true);
    void save(value);
  }

  // A press anywhere outside the controls closes the picker.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Escape closes; the arrow keys move between the picker's buttons.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>("#theme-picker button") ??
        [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = at === -1 ? (step === 1 ? 0 : items.length - 1) : at + step;
    items[(next + items.length) % items.length].focus();
  }

  return (
    <div
      ref={root}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      className={`relative flex flex-col font-body ${
        opens === "down" ? "items-end" : "items-start"
      }`}
    >
      <button
        ref={trigger}
        id="theme-button"
        type="button"
        aria-expanded={open}
        aria-controls="theme-picker"
        onClick={() => setOpen((value) => !value)}
        className={`${SECONDARY_SM} inline-flex items-center gap-1.5`}
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13.5 2.5l-6 6" />
          <path d="M7.5 8.5c-2-.2-3.3 1-3.4 2.7-.1 1.2-.8 1.8-1.6 2 2.7.8 5.3.3 5.9-2 .3-1.1-.1-2.1-.9-2.7z" />
        </svg>
        Theme
      </button>
      {open && (
        <div
          id="theme-picker"
          role="group"
          aria-label="Themes"
          className={`absolute z-50 flex min-w-36 flex-col rounded border border-edge bg-surface-card p-1 text-sm ${
            opens === "down" ? "top-full right-0 mt-2" : "bottom-full left-0 mb-2"
          }`}
        >
          {themes.map((option) => (
            <button
              key={option}
              type="button"
              aria-current={option === theme ? "true" : undefined}
              onClick={() => choose(option)}
              className={`flex items-center gap-2 rounded px-2 py-1 text-left whitespace-nowrap hover:bg-surface-muted ${FOCUS_RING}`}
            >
              <span aria-hidden="true" className="w-4">
                {option === theme ? "✓" : ""}
              </span>
              <span
                aria-hidden="true"
                data-theme={option}
                className="h-3 w-3 rounded-sm border border-edge-strong bg-surface"
              />
              {THEME_NAMES[option]}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="status" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
