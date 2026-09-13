import { NextResponse } from "next/server";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import {
  isValidIanaTimeZone,
  slotToDbTime,
  validateRanges,
} from "@/domain/availability";

export const dynamic = "force-dynamic";

// Replaces the caller's entire standing availability (with per-range status),
// availability note, and time zone in one transaction, bumping the version so
// copies into events can reference it.
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  let ranges;
  try {
    ranges = validateRanges((body as { ranges?: unknown } | null)?.ranges);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid ranges" },
      { status: 400 },
    );
  }
  // The zone is normally changed through /api/me/time-zone; this PUT only
  // updates it when a caller still sends one.
  const { timeZone, note } = body as { timeZone?: unknown; note?: unknown };
  if (timeZone !== undefined && !isValidIanaTimeZone(timeZone)) {
    return NextResponse.json(
      { error: "timeZone must be a valid IANA time-zone name" },
      { status: 400 },
    );
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return NextResponse.json(
      { error: "note must be a string" },
      { status: 400 },
    );
  }
  const availabilityNote =
    typeof note === "string" && note.trim().length > 0 ? note : null;

  const version = await prisma.$transaction(async (tx) => {
    const { _max } = await tx.standingAvailability.aggregate({
      where: { userId: user.id },
      _max: { version: true },
    });
    const nextVersion = (_max.version ?? 0) + 1;
    await tx.standingAvailability.deleteMany({ where: { userId: user.id } });
    if (ranges.length > 0) {
      await tx.standingAvailability.createMany({
        data: ranges.map((range) => ({
          userId: user.id,
          version: nextVersion,
          weekday: range.weekday,
          startLocal: slotToDbTime(range.startSlot),
          endLocal: slotToDbTime(range.endSlot),
          status: range.status,
        })),
      });
    }
    await tx.user.update({
      where: { id: user.id },
      data: {
        ...(typeof timeZone === "string" ? { timeZone } : {}),
        availabilityNote,
      },
    });
    return nextVersion;
  });

  return NextResponse.json({ version });
}
