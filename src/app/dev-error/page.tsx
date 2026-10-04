import { notFound } from "next/navigation";
import { isDevIssuerEnabled } from "@/adapters/auth";

export const dynamic = "force-dynamic";

/** Exists so the error page can be seen in development; a 404 everywhere else. */
export default function DevErrorPage() {
  if (!isDevIssuerEnabled()) notFound();
  throw new Error("A deliberate error, to show the error page in development.");
}
