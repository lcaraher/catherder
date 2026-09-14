import Link from "next/link";

/**
 * App-wide 404, also rendered by every notFound() call. Deliberately bare:
 * whether the page never existed or the viewer may not know it exists, the
 * answer looks the same.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
        <p className="mb-2">This page does not exist.</p>
        <Link href="/" className="underline">
          Back to the home page
        </Link>
      </div>
    </main>
  );
}
