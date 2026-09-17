import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { appUrl } from "@/adapters/app-config";
import { completeLoginFlow, LoginFlowError } from "@/adapters/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  let next = "/";
  try {
    next = await completeLoginFlow(query);
  } catch (error) {
    // Only the failure kind is logged; never the code, tokens, or response body.
    const kind = error instanceof LoginFlowError ? error.kind : "unexpected";
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    console.warn(`auth callback failed request=${requestId} kind=${kind}`);
  }
  return NextResponse.redirect(appUrl(next), 303);
}
