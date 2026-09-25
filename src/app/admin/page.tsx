import { notFound } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { EventRow } from "@/components/event-row";
import { Pane } from "@/components/pane";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  // Everyone else gets a 404, so the page never confirms it exists.
  if (!user.siteAdmin) notFound();

  const events = await prisma.event.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      archivedAt: true,
      organizerUser: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Pane as="div" className="mb-6">
        <h1 className="text-2xl font-semibold">All events</h1>
      </Pane>
      {events.length === 0 ? (
        <p className="text-sm text-hint">No events yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <EventRow
              key={event.id}
              href={`/e/${event.id}/manage`}
              name={event.name}
              organizerName={event.organizerUser.displayName}
              status={event.status}
              note={event.archivedAt !== null ? "Archived" : undefined}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
