import Link from "next/link";

/** Site footer on every page; the bottom padding clears the theme controls. */
export function Footer() {
  return (
    <footer className="border-t border-edge bg-surface-card">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-4 pt-4 pb-16 font-pixel text-xs text-hint">
        <span>catherder</span>
        <Link href="/help" className="pixel-pointer">
          Help
        </Link>
        <Link href="/help#about" className="pixel-pointer">
          About
        </Link>
        <a href="#" aria-disabled="true" title="Coming later">
          Support the cats
        </a>
        <span>made for friends</span>
      </div>
    </footer>
  );
}
