import { NextResponse } from "next/server";
import {
  isDevIssuerEnabled,
  loginWithIdToken,
  mintDevIdToken,
} from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";

export const dynamic = "force-dynamic";

// Dev-only: mints a signed ID token for the chosen user and runs it through
// the same verify-and-login path a real issuer's token would take.
export async function POST(request: Request) {
  if (!isDevIssuerEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const form = await request.formData();
  const userId = String(form.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "unknown user" }, { status: 400 });
  }
  const idToken = await mintDevIdToken(user);
  await loginWithIdToken(idToken);
  return NextResponse.redirect(new URL("/", request.url), 303);
}
