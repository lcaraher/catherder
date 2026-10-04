"use client";

import { GLYPHS, type KonamiKey } from "@/components/use-konami";

// Same focus ring as the buttons in button-classes.ts.
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const ARM = `size-5.5 rounded-none border-0 p-0 leading-none bg-edge-strong font-pixel-display text-xs text-foreground press ${FOCUS_RING}`;
const ROUND = `size-8.5 rounded-full border-2 accent-gradient-border p-0 leading-none font-pixel-display text-foreground press ${FOCUS_RING}`;
const WELL = "flex size-10.5 items-center justify-center rounded-full border border-edge bg-surface-raised";

// The D-pad, row by row; null cells are the empty corners and the centre.
const DPAD: (KonamiKey | null)[][] = [
  [null, "ArrowUp", null],
  ["ArrowLeft", null, "ArrowRight"],
  [null, "ArrowDown", null],
];

const ARM_LABELS: Partial<Record<KonamiKey, string>> = {
  ArrowUp: "Up",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowDown: "Down",
};

/** A small game controller whose buttons feed onPress with the key they stand for. */
export function NesController({ onPress }: { onPress: (key: KonamiKey) => void }) {
  return (
    <div
      role="group"
      aria-label="Controller"
      className="relative mx-auto mt-4 h-44 w-104 max-w-full rounded-xl border-2 border-edge-strong bg-surface-raised p-4"
    >
      <div className="flex h-full items-center justify-between rounded-md border border-edge bg-surface-card px-5">
        <div className="grid size-16.5 grid-cols-3 grid-rows-3">
          {DPAD.flatMap((row, y) =>
            row.map((key, x) => {
              if (key) {
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={ARM_LABELS[key]}
                    className={ARM}
                    onClick={() => onPress(key)}
                  >
                    {GLYPHS[key]}
                  </button>
                );
              }
              const centre = x === 1 && y === 1;
              return <span key={`${x}-${y}`} className={centre ? "size-5.5 bg-edge-strong" : undefined} />;
            }),
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="h-1.5 w-26 rounded-full bg-edge" />
            <span className="h-1.5 w-26 rounded-full bg-edge" />
            <span className="h-1.5 w-26 rounded-full bg-edge" />
          </div>
          <div className="flex gap-4">
            <span className="flex flex-col items-center gap-1">
              <span className="h-2.5 w-9 rounded-full bg-edge-strong" />
              <span className="font-pixel text-xs text-hint">SELECT</span>
            </span>
            <span className="flex flex-col items-center gap-1">
              <span className="h-2.5 w-9 rounded-full bg-edge-strong" />
              <span className="font-pixel text-xs text-hint">START</span>
            </span>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <span className={`${WELL} translate-y-2.25`}>
            <button type="button" aria-label="B" className={ROUND} onClick={() => onPress("b")}>
              B
            </button>
          </span>
          <span className={`${WELL} -translate-y-2.25`}>
            <button type="button" aria-label="A" className={ROUND} onClick={() => onPress("a")}>
              A
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
