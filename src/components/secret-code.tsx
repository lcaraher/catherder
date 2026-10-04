/** The secret code as arrow glyphs and letters, read out in words. */
export function SecretCode() {
  return (
    <span
      role="img"
      className="font-pixel-display tracking-wide text-foreground"
      aria-label="up up down down left right left right B A"
    >
      {"↑↑↓↓←→←→BA"}
    </span>
  );
}
