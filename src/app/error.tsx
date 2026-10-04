"use client";

import Link from "next/link";
import { PRIMARY, SECONDARY } from "@/components/button-classes";
import { ErrorPage } from "@/components/error-page";

/** Generic error boundary; never shows the error's message or stack. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;
  return (
    <ErrorPage heading="YOU GOTTA BE KITTEN ME!" errorLine="error 500">
      <button type="button" onClick={reset} className={PRIMARY}>
        Try again
      </button>
      <Link href="/" className={`${SECONDARY} no-underline`}>
        Back to the home page
      </Link>
    </ErrorPage>
  );
}
