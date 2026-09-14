import { NextResponse } from "next/server";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";

export const dynamic = "force-dynamic";

const CLOCK_FORMATS = ["TWELVE_HOUR", "TWENTY_FOUR_HOUR"] as const;
type ClockFormat = (typeof CLOCK_FORMATS)[number];

// Changes how the caller reads times and nothing else — display only, so no
// stored availability is touched.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    clockFormat?: unknown;
  } | null;
  const clockFormat = body?.clockFormat;
  if (
    typeof clockFormat !== "string" ||
    !CLOCK_FORMATS.includes(clockFormat as ClockFormat)
  ) {
    return NextResponse.json(
      { error: "clockFormat must be TWELVE_HOUR or TWENTY_FOUR_HOUR" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { clockFormat: clockFormat as ClockFormat },
    });
    // Opaque ids only — the audit row records that the format changed, not
    // what it changed to.
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "User",
        entityId: user.id,
        action: "clock_format_changed",
      },
    });
  });

  return NextResponse.json({ ok: true });
}
