import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";

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
  await requireRole(workspaceId, ["OWNER", "ORGANIZER"]);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { participants: true } } },
      },
    },
  });
  if (!workspace) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{workspace.name}</h1>
        <Link
          href={`/w/${workspaceId}/events/new`}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          New event
        </Link>
      </div>

      {workspace.events.length === 0 ? (
        <p className="text-sm text-zinc-500">No events yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {workspace.events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/w/${workspaceId}/events/${event.id}`}
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
