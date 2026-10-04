"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

export type KonamiKey = (typeof SEQUENCE)[number];

/** The glyph shown for each key of the sequence. */
export const GLYPHS: Record<KonamiKey, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  b: "B",
  a: "A",
};

type State = { progress: number; missed: number; done: boolean };

const INITIAL: State = { progress: 0, missed: 0, done: false };
const EDITABLE = "input, textarea, select, [contenteditable]";
const EDITABLE_OR_CONTROL = `${EDITABLE}, button, a`;

function isArrow(key: string): boolean {
  return key.startsWith("Arrow");
}

function advance(state: State, key: string): State {
  if (state.done) return state;
  if (key === SEQUENCE[state.progress]) {
    const progress = state.progress + 1;
    return { ...state, progress, done: progress === SEQUENCE.length };
  }
  return { ...state, progress: key === SEQUENCE[0] ? 1 : 0, missed: state.missed + 1 };
}

/** Tracks the secret code from the keyboard and from feed(); done stays true once reached. */
export function useKonami() {
  const stateRef = useRef<State>(INITIAL);
  const [state, setState] = useState<State>(INITIAL);

  const feed = useCallback((key: string) => {
    const next = advance(stateRef.current, key);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(isArrow(key) ? EDITABLE : EDITABLE_OR_CONTROL)) return;
      const before = stateRef.current.progress;
      feed(key);
      if (isArrow(key) && stateRef.current.progress > before) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [feed]);

  return { progress: state.progress, done: state.done, missed: state.missed, feed };
}
