import { NextResponse } from "next/server";
import { appUrl } from "@/adapters/app-config";
import {
  clearSession,
  hostedLogoutUrl,
  isDevIssuerEnabled,
} from "@/adapters/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await clearSession();
  // With the dev issuer enabled, land on the dev login; otherwise end the
  // hosted login session too when there is one, else land on /.
  if (isDevIssuerEnabled()) {
    return NextResponse.redirect(appUrl("/dev-login"), 303);
  }
  const target = hostedLogoutUrl() ?? appUrl("/");
  return NextResponse.redirect(target, 303);
}
