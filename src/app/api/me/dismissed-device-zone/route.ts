import { NextResponse } from "next/server";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";

export const dynamic = "force-dynamic";

// Stores the detected device zone the caller chose to ignore; the mismatch
// banner stays hidden until the device reports a different zone.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    deviceZone?: unknown;
  } | null;
  const deviceZone = body?.deviceZone;
  if (
    typeof deviceZone !== "string" ||
    !Intl.supportedValuesOf("timeZone").includes(deviceZone)
  ) {
    return NextResponse.json(
      { error: "deviceZone must be a supported IANA time-zone name" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { dismissedDeviceZone: deviceZone },
    });
    // Opaque ids only — the audit row records the dismissal, not the zones.
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "User",
        entityId: user.id,
        action: "device_zone_dismissed",
      },
    });
  });

  return NextResponse.json({ ok: true });
}
