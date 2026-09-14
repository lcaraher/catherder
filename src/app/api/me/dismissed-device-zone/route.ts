import { NextResponse } from "next/server";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";

export const dynamic = "force-dynamic";

// Records that the caller saw the device-zone mismatch banner for this
// detected zone and chose to keep their profile zone. The banner stays
// hidden until the device reports a different zone. The profile zone itself
// is never touched here; /api/me/time-zone owns that (and clears this).
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
