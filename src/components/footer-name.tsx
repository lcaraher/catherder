"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { PAW_MASK } from "@/components/paw-mask";

const NAME = "catherder";
const COLS = 28;
const ROWS = 24;
const SCRAMBLE_STEPS = 6;
const SCRAMBLE_MS = 45;
const FADE_MS = 200;
const CELL_MS = 1.5;
const TWINKLE_MS = 110;
const TWINKLE_COUNT = 10;

type Kind = "t" | "p" | "L";
type Cell = { kind: Kind; row: number; col: number; mix: string } | null;

const CELLS: Cell[] = PAW_MASK.flatMap((line, row) =>
  Array.from(line, (char, col) =>
    char === "."
      ? null
      : {
          kind: char as Kind,
          row,
          col,
          mix: `${Math.round((col / (COLS - 1)) * 60 + (row / (ROWS - 1)) * 40)}%`,
        },
  ),
);
const LIT = CELLS.flatMap((cell, i) => (cell ? [i] : []));
const TWINKLING = LIT.filter((i) => CELLS[i]?.kind !== "L");

type Phase = "idle" | "scramble" | "fade" | "paw";

function randomDigit(): string {
  return Math.random() < 0.5 ? "0" : "1";
}

function scrambled(count: number): string {
  return Array.from(NAME, (char, i) => (i < count ? randomDigit() : char)).join("");
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Each lit cell's place in the build: distance from column 3, row 2, plus a random 0–3. */
function buildRanks(): number[] {
  const order = LIT.map((i) => {
    const cell = CELLS[i]!;
    return { i, key: Math.hypot(cell.col - 3, cell.row - 2) + Math.random() * 3 };
  }).sort((a, b) => a.key - b.key);
  const ranks = new Array<number>(CELLS.length).fill(Infinity);
  order.forEach(({ i }, rank) => (ranks[i] = rank));
  return ranks;
}

/** The footer's name and line; the name turns into a paw print on mouse entry or a tap. */
export function FooterName({ line }: { line: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const pointerType = useRef("mouse");
  const timers = useRef<number[]>([]);
  const frame = useRef(0);
  const twinkleTimer = useRef<number | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("idle");
  const [scramble, setScramble] = useState<string | null>(null);
  const [cell, setCell] = useState(3);
  const [ranks, setRanks] = useState<number[]>([]);
  const [lit, setLit] = useState(0);
  const [digits, setDigits] = useState<string[]>([]);

  const clearAll = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    window.clearInterval(twinkleTimer.current);
    window.cancelAnimationFrame(frame.current);
  };

  useEffect(() => clearAll, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const startPaw = (reduce: boolean) => {
    const box = boxRef.current;
    if (!box) return;
    const size = Math.max(3, Math.floor(Math.min(box.clientHeight / ROWS, box.clientWidth / COLS)));
    const nextRanks = buildRanks();
    setCell(size);
    setRanks(nextRanks);
    setDigits(CELLS.map((c) => (c?.kind === "L" ? "1" : randomDigit())));
    setScramble(null);
    setPhase("paw");
    if (reduce) {
      setLit(LIT.length);
      return;
    }
    setLit(0);
    const begin = performance.now();
    const build = (now: number) => {
      const count = Math.min(LIT.length, Math.floor((now - begin) / CELL_MS) + 1);
      setLit(count);
      if (count < LIT.length) {
        frame.current = window.requestAnimationFrame(build);
        return;
      }
      twinkleTimer.current = window.setInterval(() => {
        setDigits((prev) => {
          const next = [...prev];
          for (let n = 0; n < TWINKLE_COUNT; n += 1) {
            const i = TWINKLING[Math.floor(Math.random() * TWINKLING.length)];
            next[i] = next[i] === "1" ? "0" : "1";
          }
          return next;
        });
      }, TWINKLE_MS);
    };
    frame.current = window.requestAnimationFrame(build);
  };

  const play = () => {
    if (phase !== "idle") return;
    clearAll();
    const reduce = reducedMotion();
    setPhase(reduce ? "fade" : "scramble");
    if (reduce) {
      // Measured after the commit so the box's phone min-height applies.
      frame.current = window.requestAnimationFrame(() => startPaw(true));
      return;
    }
    for (let step = 1; step <= SCRAMBLE_STEPS; step += 1) {
      const count = Math.ceil((NAME.length * step) / SCRAMBLE_STEPS);
      later(() => setScramble(scrambled(count)), (step - 1) * SCRAMBLE_MS);
    }
    const fadeAt = SCRAMBLE_STEPS * SCRAMBLE_MS;
    later(() => setPhase("fade"), fadeAt);
    later(() => startPaw(false), fadeAt + FADE_MS);
  };

  const reset = () => {
    clearAll();
    setPhase("idle");
    setScramble(null);
    setLit(0);
  };

  const onBoxClick = (event: MouseEvent) => {
    if (pointerType.current === "mouse") return;
    if (phase !== "idle") reset();
    else if (nameRef.current?.contains(event.target as Node)) play();
  };

  const active = phase !== "idle";
  const hidden = phase === "fade" || phase === "paw";
  const fade = `transition-opacity duration-200 motion-reduce:transition-none ${hidden ? "opacity-0" : ""}`;

  return (
    <div
      ref={boxRef}
      onPointerDown={(event: PointerEvent) => (pointerType.current = event.pointerType)}
      onPointerLeave={(event: PointerEvent) => {
        if (event.pointerType === "mouse") reset();
      }}
      onClick={onBoxClick}
      className={`relative flex flex-col items-start gap-1 self-stretch sm:flex-1 ${active ? "max-sm:min-h-38" : ""}`}
    >
      <span
        ref={nameRef}
        data-glow={active ? "" : undefined}
        onPointerEnter={(event: PointerEvent) => {
          if (event.pointerType === "mouse") play();
        }}
        className="name-glow font-pixel-display text-base whitespace-nowrap text-foreground"
      >
        <span className={`relative inline-block ${fade}`}>
          <span className={scramble === null ? undefined : "text-transparent"}>{NAME}</span>
          {scramble !== null && (
            <span aria-hidden="true" className="absolute top-0 left-0">
              {scramble}
            </span>
          )}
        </span>
      </span>
      <span data-footer-line className={`text-xs whitespace-pre-line text-balance text-hint ${fade}`}>
        {line}
      </span>
      {phase === "paw" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="paw-grid" style={{ "--cell": `${cell}px` } as CSSProperties}>
            {CELLS.map((c, i) =>
              c === null || ranks[i] >= lit ? (
                <span key={i} />
              ) : c.kind === "L" ? (
                <span key={i} className="text-foreground">
                  1
                </span>
              ) : (
                <span
                  key={i}
                  data-kind={c.kind}
                  data-digit={digits[i]}
                  className="paw-cell"
                  style={{ "--mix": c.mix } as CSSProperties}
                >
                  {digits[i]}
                </span>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
