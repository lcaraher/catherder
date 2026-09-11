import { NextResponse } from "next/server";
import { clearSession } from "@/adapters/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await clearSession();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
