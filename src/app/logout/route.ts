import { NextResponse } from "next/server";
import {
  clearSession,
  hostedLogoutUrl,
  isDevIssuerEnabled,
} from "@/adapters/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await clearSession();
  // With the dev issuer enabled, land on the dev login; otherwise end the
  // hosted login session too when there is one, else land on /.
  if (isDevIssuerEnabled()) {
    return NextResponse.redirect(new URL("/dev-login", request.url), 303);
  }
  const target = hostedLogoutUrl() ?? new URL("/", request.url);
  return NextResponse.redirect(target, 303);
}
