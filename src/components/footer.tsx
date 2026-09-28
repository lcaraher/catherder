import Link from "next/link";
import type { Theme } from "@/domain/theme";
import { ThemeControls } from "@/components/theme-controls";

/** Site footer on every page; signed out, the theme controls lead its row. */
export function Footer({
  themeControls,
}: {
  themeControls: { initialTheme: Theme; themes: readonly Theme[] } | null;
}) {
  return (
    <footer className="border-t border-edge bg-surface-card">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-4 pt-4 pb-4 font-pixel text-xs text-hint">
        {themeControls && (
          <ThemeControls
            initialTheme={themeControls.initialTheme}
            themes={themeControls.themes}
            opens="up"
          />
        )}
        <span>catherder</span>
        <Link href="/help" className="pixel-pointer">
          Help
        </Link>
        <Link href="/help#about" className="pixel-pointer">
          About
        </Link>
        <a
          href="#"
          aria-disabled="true"
          title="Coming later"
          className="pixel-pointer cursor-not-allowed"
        >
          Support the cats
        </a>
        <span>made for friends</span>
      </div>
    </footer>
  );
}
