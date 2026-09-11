import { NextResponse } from "next/server";
import { getDevJwks, isDevIssuerEnabled } from "@/adapters/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDevIssuerEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(await getDevJwks());
}
