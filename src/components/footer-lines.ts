export const FOOTER_LINES: readonly string[] = [
  "real tom energy",
  "get yo game on",
  "one calendar,\nmany cats",
  "gives +10 to scheduling",
  "the game, you lose.",
];

/** One line from FOOTER_LINES; `random` returns a number in [0, 1). */
export function pickFooterLine(random: () => number = Math.random): string {
  const index = Math.min(Math.floor(random() * FOOTER_LINES.length), FOOTER_LINES.length - 1);
  return FOOTER_LINES[index];
}
