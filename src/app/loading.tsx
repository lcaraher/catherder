import { Pane } from "@/components/pane";

const BAR = "skeleton-bar h-2.5 rounded-full";

// Placeholder panes while the next page loads; only "Loading…" is announced.
export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="loading-delay mx-auto w-full max-w-3xl flex-1 px-4 py-8"
    >
      <div aria-hidden="true">
        <Pane as="div" className="shimmer mb-6 flex flex-col gap-2.5">
          <div className={`${BAR} w-11/20`} />
          <div className={`${BAR} w-4/5`} />
          <div className={`${BAR} w-3/10`} />
        </Pane>
        <Pane as="div" className="shimmer mb-6 flex flex-col gap-2.5">
          <div className={`${BAR} w-13/20`} />
          <div className={`${BAR} w-9/20`} />
        </Pane>
      </div>
      <p className="font-small text-sm text-hint">Loading…</p>
    </main>
  );
}
