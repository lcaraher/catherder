"use client";

import Link from "next/link";

/** Generic error boundary; never shows the error's message or stack. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
        <p className="mb-2">Something went wrong.</p>
        <p className="flex items-center gap-4">
          <button type="button" onClick={reset} className="underline">
            Try again
          </button>
          <Link href="/" className="underline">
            Back to the home page
          </Link>
        </p>
      </div>
    </main>
  );
}
