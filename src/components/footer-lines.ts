// Placeholders for DW's own words.
export const FOOTER_LINES: readonly string[] = [
  "made for friends",
  "no cats were rushed",
  "one calendar,\nmany cats",
  "herding since roll one",
];

/** One line from FOOTER_LINES; `random` returns a number in [0, 1). */
export function pickFooterLine(random: () => number = Math.random): string {
  const index = Math.min(Math.floor(random() * FOOTER_LINES.length), FOOTER_LINES.length - 1);
  return FOOTER_LINES[index];
}
