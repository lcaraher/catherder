import { NextResponse } from "next/server";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { slotToDbTime, validateRanges } from "@/domain/availability";

export const dynamic = "force-dynamic";

// Replaces the GameMaster's availability for one event. Strictly the event's
// GM — not an organizer override — and strictly EventAvailability rows: no
// answers, no response status. An empty ranges list clears the rows, which
// is a valid state (the overlap then shows the players on their own).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  // Non-GMs get a 404 rather than confirmation the event exists.
  if (!event || event.gmUserId !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    ranges?: unknown;
  } | null;
  let ranges;
  try {
    ranges = validateRanges(body?.ranges);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid ranges" },
      { status: 400 },
    );
  }

  const standingVersion =
    (
      await prisma.standingAvailability.aggregate({
        where: { userId: user.id },
        _max: { version: true },
      })
    )._max.version ?? 0;

  await prisma.$transaction(async (tx) => {
    await tx.eventAvailability.deleteMany({
      where: { eventId, userId: user.id },
    });
    if (ranges.length > 0) {
      await tx.eventAvailability.createMany({
        data: ranges.map((range) => ({
          eventId,
          userId: user.id,
          weekday: range.weekday,
          startLocal: slotToDbTime(range.startSlot),
          endLocal: slotToDbTime(range.endSlot),
          status: range.status,
          copiedFromStandingVersion: standingVersion,
        })),
      });
    }
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "Event",
        entityId: eventId,
        action: ranges.length > 0 ? "gm_availability_set" : "gm_availability_cleared",
      },
    });
  });

  return NextResponse.json({ ok: true });
}
