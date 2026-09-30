import Link from "next/link";
import { Pane } from "@/components/pane";

/**
 * App-wide 404, also rendered by every notFound() call; a missing page and
 * a page the viewer may not see look the same.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Pane as="div">
      <div className="rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
        <h1 className="mb-2 font-body text-sm font-normal">This page does not exist.</h1>
        <Link href="/" className="underline">
          Back to the home page
        </Link>
      </div>
      </Pane>
    </main>
  );
}
