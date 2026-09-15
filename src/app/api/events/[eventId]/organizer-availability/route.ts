import { NextResponse } from "next/server";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { slotToDbTime, validateRanges } from "@/domain/availability";

export const dynamic = "force-dynamic";

// Replaces the Organizer's availability rows for one event — no answers, no
// response status. Empty ranges clear the rows; a participating organizer is refused.
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
  // Non-organizers get a 404 rather than confirmation the event exists.
  if (!event || event.organizerUserId !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (event.organizerParticipates) {
    return NextResponse.json(
      { error: "you respond to this event like any other participant" },
      { status: 403 },
    );
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
        action:
          ranges.length > 0
            ? "organizer_availability_set"
            : "organizer_availability_cleared",
      },
    });
  });

  return NextResponse.json({ ok: true });
}
