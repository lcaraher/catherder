import { NextResponse } from "next/server";
import { version } from "../../../../package.json";

export const dynamic = "force-dynamic";

// Liveness check for the platform; touches no database and no session.
export async function GET() {
  return NextResponse.json(
    { ok: true, version },
    { headers: { "Cache-Control": "no-store" } },
  );
}
