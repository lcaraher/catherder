import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { statusLabel } from "@/domain/status-label";
import { Pane } from "@/components/pane";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-badge-draft text-badge-draft-text",
  OPEN: "bg-badge-open text-badge-open-text",
  CLOSED: "bg-badge-closed text-badge-closed-text",
};

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
            <li key={event.id}>
              <Link
                href={`/e/${event.id}/manage`}
                className="no-underline flex items-center justify-between gap-3 rounded border border-edge px-4 py-3 hover:bg-surface-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {event.name}
                  </span>
                  <span className="block truncate text-xs text-hint">
                    Organized by {event.organizerUser.displayName}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-sm text-hint">
                  {event.archivedAt !== null && (
                    <span className="text-xs">Archived</span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}
                  >
                    {statusLabel(event.status)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
