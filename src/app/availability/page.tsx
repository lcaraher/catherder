import { requireUser } from "@/adapters/auth";
import { Pane } from "@/components/pane";
import { prisma } from "@/adapters/db/client";
import { dbTimeToSlot } from "@/domain/availability";
import {
  buildTimeZoneOptions,
  groupTimeZoneOptions,
} from "@/domain/time-zones";
import { AvailabilityGrid } from "@/components/availability-grid";
import { ClockFormatPicker } from "@/components/clock-format-picker";
import { TimeZonePicker } from "@/components/time-zone-picker";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const user = await requireUser();
  const rows = await prisma.standingAvailability.findMany({
    where: { userId: user.id },
    orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
  });
  const ranges = rows.map((row) => ({
    weekday: row.weekday,
    startSlot: dbTimeToSlot(row.startLocal, "start"),
    endSlot: dbTimeToSlot(row.endLocal, "end"),
    status: row.status,
  }));

  // Abbreviations and offsets are computed here, at render time, so DST is
  // right for today; the client only filters this prepared list.
  const zoneGroups = groupTimeZoneOptions(
    buildTimeZoneOptions(Intl.supportedValuesOf("timeZone")),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Pane as="div" className="mb-6">
        <h1 className="text-2xl font-semibold">Weekly availability</h1>
      </Pane>
      <TimeZonePicker
        groups={zoneGroups}
        initialZoneId={user.timeZone}
        initialDismissedZone={user.dismissedDeviceZone}
        hint="Hours in the grid below are based on your personal time. Please ensure the correct time zone for you is set so that the schedule is interpreted to the event organizer's own time zone correctly."
      />
      <ClockFormatPicker initialFormat={user.clockFormat} />
      <Pane>
        <AvailabilityGrid
          initialRanges={ranges}
          clockFormat={user.clockFormat}
        />
      </Pane>
    </main>
  );
}
