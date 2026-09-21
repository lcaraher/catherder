import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSessionUser } from "@/adapters/auth";
import { readThemeCookie } from "@/adapters/theme-cookie";
import { THEMES } from "@/domain/theme";
import { ThemeControls } from "@/components/theme-controls";

export const metadata: Metadata = {
  title: "catherder",
  description: "Find when everyone can meet",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  const theme = await readThemeCookie();

  return (
    <html lang="en" data-theme={theme} className="h-full antialiased">
      {/* Bottom padding lets the last element scroll clear of the theme region. */}
      <body className="min-h-full flex flex-col pb-20">
        {user && (
          <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <Link href="/">catherder</Link>
            <Link href="/availability">Availability</Link>
            <Link href="/join">Join an event</Link>
            <Link href="/help">How do?</Link>
            <span className="ml-auto flex items-center gap-4">
              <span>{user.displayName}</span>
              <a href="/logout">Log out</a>
            </span>
          </header>
        )}
        {children}
        <div
          role="region"
          aria-label="Theme"
          className="fixed bottom-4 left-4 z-50"
        >
          <ThemeControls initialTheme={theme} themes={THEMES} />
        </div>
      </body>
    </html>
  );
}
