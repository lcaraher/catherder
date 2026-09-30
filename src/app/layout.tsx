import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { buildLabel } from "@/adapters/app-config";
import { getSessionUser } from "@/adapters/auth";
import { readThemeCookie } from "@/adapters/theme-cookie";
import { THEMES } from "@/domain/theme";
import { Footer } from "@/components/footer";
import { pickFooterLine } from "@/components/footer-lines";
import { Logo } from "@/components/logo";
import { ThemeControls } from "@/components/theme-controls";
import { ThemePointer } from "@/components/theme-pointer";
import { Wordmark } from "@/components/wordmark";

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
              <Wordmark />
            </Link>
            {/* Phones: a second row under a line; from sm the links sit in the one row. */}
            <div className="flex w-full justify-between border-t border-edge pt-2 max-sm:order-2 sm:contents">
              <Link href="/availability" className={navLink}>
                Availability
              </Link>
              <Link href="/join" className={navLink}>
                Join an event
              </Link>
              <Link href="/help" className={navLink}>
                How do?
              </Link>
              {/* From sm: pushed right, one gap-4 from the name like the group it joins. */}
              <div className="sm:ml-auto sm:-mr-2">
                <ThemeControls initialTheme={theme} themes={THEMES} opens="down" />
                <ThemePointer targetId="theme-button" />
              </div>
            </div>
            <span className="flex items-center justify-end gap-4 max-sm:order-1 max-sm:ml-auto max-sm:grow max-sm:basis-0">
              <span className="font-small font-medium break-words text-right">
                {user.displayName}
              </span>
              <a href="/logout" className={`${navLink} whitespace-nowrap`}>
                Log out
              </a>
            </span>
          </header>
        )}
        {children}
        <Footer
          signedIn={Boolean(user)}
          initialTheme={theme}
          themes={THEMES}
          line={pickFooterLine()}
          build={buildLabel()}
        />
      </body>
    </html>
  );
}
