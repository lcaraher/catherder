import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { dbTimeToHour } from "@/domain/availability";
import { AvailabilityGrid } from "@/components/availability-grid";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const user = await requireUser();
  const rows = await prisma.standingAvailability.findMany({
    where: { userId: user.id },
    orderBy: [{ weekday: "asc" }, { startLocal: "asc" }],
  });
  const ranges = rows.map((row) => ({
    weekday: row.weekday,
    startHour: dbTimeToHour(row.startLocal, "start"),
    endHour: dbTimeToHour(row.endLocal, "end"),
  }));

  const timeZones = Intl.supportedValuesOf("timeZone");
  if (!timeZones.includes(user.timeZone)) timeZones.unshift(user.timeZone);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Weekly availability</h1>
      <AvailabilityGrid
        initialRanges={ranges}
        initialTimeZone={user.timeZone}
        timeZones={timeZones}
      />
    </main>
  );
}
