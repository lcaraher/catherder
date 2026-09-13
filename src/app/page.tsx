import Link from "next/link";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { canEditResponse } from "@/domain/response-access";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  OPEN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400",
  CLOSED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
};

// One inbox row: the event, which workspace it belongs to, its status, and
// optionally the viewer's own state. Never anything about other people.
function EventRow({
  href,
  name,
  workspaceName,
  status,
  note,
}: {
  href: string;
  name: string;
  workspaceName: string;
  status: string;
  note?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-xs text-zinc-500">
            {workspaceName}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-sm text-zinc-500">
          {note && <span className="text-xs">{note}</span>}
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
          >
            {status}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <h1 className="text-3xl font-semibold">catherder</h1>
      </main>
    );
  }

  const [memberships, participations, gmEvents] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId: user.id },
      select: { workspaceId: true },
      orderBy: { workspace: { name: "asc" } },
    }),
    prisma.eventParticipant.findMany({
      where: { userId: user.id },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            status: true,
            workspace: { select: { name: true } },
          },
        },
      },
      orderBy: { event: { createdAt: "desc" } },
    }),
    prisma.event.findMany({
      where: { gmUserId: user.id },
      select: {
        id: true,
        name: true,
        status: true,
        workspaceId: true,
        workspace: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const needsResponse = participations.filter(
    (p) =>
      p.event.status !== "DRAFT" &&
      p.responseStatus === "INVITED" &&
      canEditResponse({
        eventStatus: p.event.status,
        editUnlockedAt: p.editUnlockedAt,
      }),
  );
  const submitted = participations.filter(
    (p) => p.responseStatus === "SUBMITTED",
  );

  const nothingWaiting =
    needsResponse.length === 0 &&
    submitted.length === 0 &&
    gmEvents.length === 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      {memberships.length > 0 && (
        // With one membership this creates straight there; with several, the
        // form itself offers a destination picker. Non-members see nothing.
        <div className="mb-6">
          <Link
            href={`/w/${memberships[0].workspaceId}/events/new`}
            className="inline-block rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            New event
          </Link>
        </div>
      )}
      {nothingWaiting ? (
        <p className="text-sm text-zinc-500">
          Nothing is waiting for you right now — enjoy the quiet.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {needsResponse.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium">Needs your response</h2>
              <ul className="flex flex-col gap-2">
                {needsResponse.map((p) => (
                  <EventRow
                    key={p.eventId}
                    href={`/e/${p.eventId}/respond`}
                    name={p.event.name}
                    workspaceName={p.event.workspace.name}
                    status={p.event.status}
                  />
                ))}
              </ul>
            </section>
          )}

          {submitted.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium">Your responses</h2>
              <ul className="flex flex-col gap-2">
                {submitted.map((p) => (
                  <EventRow
                    key={p.eventId}
                    href={`/e/${p.eventId}/respond`}
                    name={p.event.name}
                    workspaceName={p.event.workspace.name}
                    status={p.event.status}
                    note={
                      canEditResponse({
                        eventStatus: p.event.status,
                        editUnlockedAt: p.editUnlockedAt,
                      })
                        ? "You can still change it"
                        : "Locked"
                    }
                  />
                ))}
              </ul>
            </section>
          )}

          {gmEvents.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium">Events you run</h2>
              <ul className="flex flex-col gap-2">
                {gmEvents.map((event) => (
                  <EventRow
                    key={event.id}
                    href={`/w/${event.workspaceId}/events/${event.id}`}
                    name={event.name}
                    workspaceName={event.workspace.name}
                    status={event.status}
                  />
                ))}
              </ul>
            </section>
          )}

        </div>
      )}
    </main>
  );
}
