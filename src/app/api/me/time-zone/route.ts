import { NextResponse } from "next/server";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";

export const dynamic = "force-dynamic";

// Changes the caller's time zone and nothing else. Availability is stored as
// local wall-clock plus this zone, so a zone change reinterprets the stored
// times — StandingAvailability and EventAvailability rows are deliberately
// left untouched, never shifted.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    timeZone?: unknown;
  } | null;
  const timeZone = body?.timeZone;
  if (
    typeof timeZone !== "string" ||
    !Intl.supportedValuesOf("timeZone").includes(timeZone)
  ) {
    return NextResponse.json(
      { error: "timeZone must be a supported IANA time-zone name" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { timeZone } });
    // Opaque ids only — the audit row records that the zone changed, not
    // what it changed to.
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "User",
        entityId: user.id,
        action: "time_zone_changed",
      },
    });
  });

  return NextResponse.json({ ok: true });
}
