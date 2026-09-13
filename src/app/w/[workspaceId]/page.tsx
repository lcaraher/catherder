import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { canManageEvent } from "@/domain/event-access";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  OPEN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400",
  CLOSED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
};

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireUser();

  // Any workspace member may view this page; a non-member gets a 404 so the
  // page never confirms the workspace exists.
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    include: { workspace: { select: { name: true } } },
  });
  if (!membership) notFound();

  const viewerIsWorkspaceOrganizer =
    membership.role === "OWNER" || membership.role === "ORGANIZER";

  // A row leads wherever the viewer can act: managers (organizers, or the
  // event's GameMaster whatever their membership role) go to the event page,
  // everyone else to their own respond page.
  const rowHref = (event: { id: string; gmUserId: string | null }): string =>
    canManageEvent({
      viewerUserId: user.id,
      gmUserId: event.gmUserId,
      viewerIsWorkspaceOrganizer,
    })
      ? `/w/${workspaceId}/events/${event.id}`
      : `/e/${event.id}/respond`;

  if (viewerIsWorkspaceOrganizer) {
    const events = await prisma.event.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { participants: true } } },
    });

    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">
          {membership.workspace.name}
        </h1>

        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={rowHref(event)}
                  className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <span className="font-medium">{event.name}</span>
                  <span className="flex items-center gap-3 text-sm text-zinc-500">
                    <span>{event._count.participants} participants</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}
                    >
                      {event.status}
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

  // Non-organizer members see only events they are part of, once those are
  // out of DRAFT — and only their own state, nothing about anyone else.
  const events = await prisma.event.findMany({
    where: {
      workspaceId,
      status: { not: "DRAFT" },
      participants: { some: { userId: user.id } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      participants: {
        where: { userId: user.id },
        select: { responseStatus: true },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">
        {membership.workspace.name}
      </h1>

      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No events for you here yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={rowHref(event)}
                className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">{event.name}</span>
                <span className="flex items-center gap-3 text-sm text-zinc-500">
                  <span
                    className={`text-xs ${
                      event.participants[0]?.responseStatus === "SUBMITTED"
                        ? "text-emerald-600"
                        : "text-zinc-400"
                    }`}
                  >
                    {event.participants[0]?.responseStatus}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}
                  >
                    {event.status}
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
