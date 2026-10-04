const GRIDS = {
  sad: [
    ".XX.........XX.",
    ".X.X.......X.X.",
    ".X..XXXXXXX..X.",
    "X.............X",
    "X.............X",
    "X..XX.....XX..X",
    "X..XX.....XX..X",
    "X.............X",
    "X......X......X",
    "X.....XXX.....X",
    "X....X...X....X",
    "X...X.....X...X",
    ".XXXXXXXXXXXXX.",
  ],
  laughing: [
    ".XX.........XX.",
    ".X.X.......X.X.",
    ".X..XXXXXXX..X.",
    "X.............X",
    "X...X.....X...X",
    "X..X.X...X.X..X",
    "X.............X",
    "X...XXXXXXX...X",
    "X...X.....X...X",
    "X...X.....X...X",
    "X....XXXXX....X",
    "X.............X",
    ".XXXXXXXXXXXXX.",
  ],
} as const;

export type CatMood = keyof typeof GRIDS;

const LABELS: Record<CatMood, string> = {
  sad: "A sad pixel cat",
  laughing: "A laughing pixel cat",
};

/** A 15×13 pixel cat drawn in currentColor, one rect per lit cell. */
export function PixelCat({ mood, className }: { mood: CatMood; className?: string }) {
  return (
    <svg
      viewBox="0 0 15 13"
      shapeRendering="crispEdges"
      role="img"
      aria-label={LABELS[mood]}
      className={className}
    >
      {GRIDS[mood].flatMap((row, y) =>
        Array.from(row, (cell, x) =>
          cell === "X" ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
          ) : null,
        ),
      )}
    </svg>
  );
}
