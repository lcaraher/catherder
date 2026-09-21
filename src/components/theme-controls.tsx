"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Theme } from "@/domain/theme";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const label = (theme: Theme) => theme[0].toUpperCase() + theme.slice(1);

/**
 * A light/dark switch with a dot beneath it that opens a picker of every
 * theme. Each choice is saved, then the route refreshes to re-render the theme.
 */
export function ThemeControls({
  initialTheme,
  themes,
}: {
  initialTheme: Theme;
  themes: readonly Theme[];
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLButtonElement>(null);

  // Presses while a save is in flight are ignored; nothing is disabled.
  async function save(value: Theme) {
    if (saving.current || value === theme) return;
    saving.current = true;
    const previous = theme;
    setTheme(value);
    setError("");
    try {
      const response = await fetch("/api/me/theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: value }),
      });
      if (!response.ok) throw new Error(`save failed (${response.status})`);
      router.refresh();
    } catch {
      setTheme(previous);
      setError("Could not save the theme. Try again.");
    }
    saving.current = false;
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) dot.current?.focus();
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
      className="relative flex flex-col items-start"
    >
      <button
        type="button"
        role="switch"
        aria-checked={theme === "dark"}
        aria-label="Dark theme"
        onClick={() => save(theme === "dark" ? "light" : "dark")}
        className={`flex items-center gap-2 rounded py-1 ${FOCUS_RING}`}
      >
        <span className="flex h-4 w-7 items-center rounded-full border border-edge-strong bg-surface-raised">
          <span
            className={`ml-px h-3 w-3 rounded-full bg-foreground transition-transform motion-reduce:transition-none ${
              theme === "dark" ? "translate-x-3" : "translate-x-0"
            }`}
          />
        </span>
        <span className="text-xs text-hint">{label(theme)}</span>
      </button>
      <button
        ref={dot}
        type="button"
        aria-expanded={open}
        aria-controls="theme-picker"
        aria-label="More themes"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-6 w-7 items-center justify-center rounded ${FOCUS_RING}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-hint" />
      </button>
      {open && (
        <div
          id="theme-picker"
          role="group"
          aria-label="Themes"
          className="absolute bottom-full left-0 mb-2 flex flex-col rounded border border-edge bg-surface-card p-1 text-sm"
        >
          {themes.map((option) => (
            <button
              key={option}
              type="button"
              aria-current={option === theme ? "true" : undefined}
              onClick={() => choose(option)}
              className={`flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-surface-muted ${FOCUS_RING}`}
            >
              <span aria-hidden="true" className="w-4">
                {option === theme ? "✓" : ""}
              </span>
              {label(option)}
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
