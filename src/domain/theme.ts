export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "light";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value as Theme);
}

/** The value when it names a theme, otherwise the default. */
export function resolveTheme(value: string | undefined): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}
