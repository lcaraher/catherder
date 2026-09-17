import { NextResponse } from "next/server";
import { appUrl } from "@/adapters/app-config";
import { isDevIssuerEnabled, startLoginFlow } from "@/adapters/auth";

export const dynamic = "force-dynamic";

// Single login entry point: the dev issuer's page locally, the hosted login otherwise.
export async function GET(request: Request) {
  const next = new URL(request.url).searchParams.get("next");
  if (isDevIssuerEnabled()) {
    const target = appUrl("/dev-login");
    if (next !== null) target.searchParams.set("next", next);
    return NextResponse.redirect(target, 303);
  }
  return NextResponse.redirect(await startLoginFlow(next), 303);
}
