import Link from "next/link";
import type { ReactNode } from "react";
import type { Theme } from "@/domain/theme";
import { DecodeLabel } from "@/components/decode-label";
import { FooterName } from "@/components/footer-name";
import { SupportNote } from "@/components/support-note";
import { ThemeControls } from "@/components/theme-controls";

const LINK = "pixel-pointer ml-3 whitespace-nowrap";

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <nav aria-label={heading}>
      <h2 className="mb-2 font-pixel text-xs font-normal whitespace-nowrap text-muted">
        {heading}
      </h2>
      <ul className="flex flex-col gap-2.5">{children}</ul>
    </nav>
  );
}

/** Site footer on every page; signed out, the theme controls lead the first group. */
export function Footer({
  signedIn,
  initialTheme,
  themes,
  line,
  build,
}: {
  signedIn: boolean;
  initialTheme: Theme;
  themes: readonly Theme[];
  line: string;
  build: string;
}) {
  return (
    <footer className="border-t border-edge bg-surface-card">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-4 font-pixel text-xs text-hint">
        <div
          className="footer-grid gap-x-3 gap-y-5"
          data-signed-out={signedIn ? undefined : ""}
        >
          <div className="col-span-2 flex flex-col items-start gap-1 sm:col-span-1">
            {!signedIn && (
              <div className="mb-2">
                <ThemeControls initialTheme={initialTheme} themes={themes} opens="up" />
              </div>
            )}
            <FooterName line={line} />
          </div>
          <Group heading="Help">
            <li>
              <Link href="/help" className={LINK}>
                <DecodeLabel text="How do?" />
              </Link>
            </li>
            <li>
              <Link href="/help#joining" className={LINK}>
                <DecodeLabel text="Join" />
              </Link>
            </li>
            <li>
              <Link href="/help#responding" className={LINK}>
                <DecodeLabel text="RSVP" />
              </Link>
            </li>
            <li>
              <a href="mailto:feedback@catherderapp.com" className={LINK}>
                <DecodeLabel text="Send feedback" />
              </a>
            </li>
          </Group>
          {signedIn && (
            <Group heading="Get around">
              <li>
                <Link href="/availability" className={LINK}>
                  <DecodeLabel text="Availability" />
                </Link>
              </li>
              <li>
                <Link href="/join" className={LINK}>
                  <DecodeLabel text="Join an event" />
                </Link>
              </li>
            </Group>
          )}
          <Group heading="About">
            <li>
              <Link href="/about" className={LINK}>
                <DecodeLabel text="About catherder" />
              </Link>
            </li>
            <li>
              <Link href="/about#accessibility" className={LINK}>
                <DecodeLabel text="Accessibility" />
              </Link>
            </li>
            <li>
              <Link href="/about#privacy" className={LINK}>
                <DecodeLabel text="Privacy" />
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/lcaraher/catherder"
                rel="noopener noreferrer"
                className={LINK}
              >
                <DecodeLabel text="Source code" />
              </a>
            </li>
            <li>
              <SupportNote />
            </li>
          </Group>
        </div>
        {build && <p className="mt-5 border-t border-edge pt-2.5 text-xs">{build}</p>}
      </div>
    </footer>
  );
}
