// The default first, then the light theme, then the rest.
export const THEMES = ["aurora", "light", "chillpill", "regal"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "aurora";

// Display names for the theme controls.
export const THEME_NAMES: Record<Theme, string> = {
  aurora: "Aurora",
  light: "Light",
  chillpill: "Chill Pill",
  regal: "Regal ASF",
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value as Theme);
}

/** The value when it names a theme, otherwise the default. */
export function resolveTheme(value: string | undefined): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}
