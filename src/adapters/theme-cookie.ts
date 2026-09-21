import { cookies } from "next/headers";
import { isTheme, resolveTheme, type Theme } from "@/domain/theme";

export const THEME_COOKIE = "catherder_theme";
const THEME_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Mirrors the account's theme into a cookie the layout can read. */
export async function setThemeCookie(theme: Theme): Promise<void> {
  (await cookies()).set(THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THEME_MAX_AGE_SECONDS,
  });
}

export async function clearThemeCookie(): Promise<void> {
  (await cookies()).delete(THEME_COOKIE);
}

/** Returns the cookie's theme, or null when it is missing or unknown. */
export async function readThemeChoice(): Promise<Theme | null> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : null;
}

/** Returns the cookie's theme; a missing or unknown value is the default. */
export async function readThemeCookie(): Promise<Theme> {
  return resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
}
