import type { CSSProperties } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { getSessionUser } from "@/adapters/auth";
import { readThemeCookie } from "@/adapters/theme-cookie";
import { THEMES } from "@/domain/theme";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { ThemeControls } from "@/components/theme-controls";

// Self-hosted faces from public/fonts; each sets one CSS variable for the
// role it plays (see ASSETS-LICENSES.md).
const wordmark = localFont({
  src: "../../public/fonts/grandstander/Grandstander-VariableFont_wght.ttf",
  weight: "100 900",
  variable: "--font-wordmark",
  display: "swap",
});
const heading = localFont({
  src: "../../public/fonts/sora/Sora-VariableFont_wght.ttf",
  weight: "100 800",
  variable: "--font-heading",
  display: "swap",
});
const small = localFont({
  src: "../../public/fonts/lexend/Lexend-VariableFont_wght.ttf",
  weight: "100 900",
  variable: "--font-small",
  display: "swap",
});
const body = localFont({
  src: [
    { path: "../../public/fonts/ibm-plex-sans/IBMPlexSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/ibm-plex-sans/IBMPlexSans-Italic.ttf", weight: "400", style: "italic" },
    { path: "../../public/fonts/ibm-plex-sans/IBMPlexSans-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/ibm-plex-sans/IBMPlexSans-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});
const digits = localFont({
  src: [
    { path: "../../public/fonts/atkinson-hyperlegible/AtkinsonHyperlegible-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/atkinson-hyperlegible/AtkinsonHyperlegible-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-digits",
  display: "swap",
});
const pixel = localFont({
  src: "../../public/fonts/silkscreen/Silkscreen-Regular.ttf",
  weight: "400",
  variable: "--font-pixel",
  display: "swap",
});
const fontClasses = [wordmark, heading, small, body, digits, pixel]
  .map((font) => font.variable)
  .join(" ");

const navLink = "font-small font-medium nav-comet";
const WORDMARK = "catherder";

export const metadata: Metadata = {
  title: "catherder",
  description: "Find when everyone can meet",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  const theme = await readThemeCookie();

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`h-full antialiased ${fontClasses}`}
    >
      <body className="header-glow flex min-h-full flex-col">
        {user && (
          <header className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-edge bg-surface-card px-4 py-3 text-sm">
            <Link
              href="/"
              className="letter-hop inline-flex items-center font-wordmark text-xl font-extrabold"
            >
              <Logo size={28} className="mr-2" />
              <span className="sr-only">{WORDMARK}</span>
              {[...WORDMARK].map((letter, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  style={{ "--i": i } as CSSProperties}
                >
                  {letter}
                </span>
              ))}
            </Link>
            <Link href="/availability" className={navLink}>
              Availability
            </Link>
            <Link href="/join" className={navLink}>
              Join an event
            </Link>
            <Link href="/help" className={navLink}>
              How do?
            </Link>
            <span className="ml-auto flex items-center gap-4">
              <span className="font-small font-medium">{user.displayName}</span>
              <a href="/logout" className={navLink}>
                Log out
              </a>
            </span>
          </header>
        )}
        {children}
        <Footer />
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
