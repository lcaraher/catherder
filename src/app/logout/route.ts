import { NextResponse } from "next/server";
import { clearSession, isDevIssuerEnabled } from "@/adapters/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await clearSession();
  // With the dev issuer enabled, landing on the dev login saves a click;
  // production (where the dev issuer is refused) keeps redirecting to /.
  const target = isDevIssuerEnabled() ? "/dev-login" : "/";
  return NextResponse.redirect(new URL(target, request.url), 303);
}
