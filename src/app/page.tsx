import Link from "next/link";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { canEditResponse } from "@/domain/response-access";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-badge-draft text-badge-draft-text",
  OPEN: "bg-badge-open text-badge-open-text",
  CLOSED: "bg-badge-closed text-badge-closed-text",
};

// One inbox row: the event, who runs it, its status, and optionally the
// viewer's own state. Never anything about other people. (D-011: the word
// "workspace" and its name stay out of the UI.)
function EventRow({
  href,
  name,
  organizerName,
  status,
  note,
  resultsHref,
}: {
  href: string;
  name: string;
  /** The event's GameMaster; events without one show no second line. */
  organizerName?: string;
  status: string;
  note?: string;
  /** Link to shared results; only passed when results are actually shared. */
  resultsHref?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 rounded border border-edge px-4 py-3 hover:bg-surface-muted"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{name}</span>
          {organizerName && (
            <span className="block truncate text-xs text-hint">
              Organized by {organizerName}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-sm text-hint">
          {note && <span className="text-xs">{note}</span>}
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
          >
            {status}
          </span>
        </span>
      </Link>
      {resultsHref && (
        <Link
          href={resultsHref}
          className="mt-1 inline-block text-xs text-hint underline"
        >
          See shared results
        </Link>
      )}
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
            resultsRevealedAt: true,
            gmUser: { select: { displayName: true } },
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
        gmUser: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // The GameMaster is not a participant (D-013): their participant row is
  // storage only, so it never appears in the response lists — their events
  // are under "Events you run" instead.
  const playerParticipations = participations.filter(
    (p) => p.role !== "GAMEMASTER",
  );
  const needsResponse = playerParticipations.filter(
    (p) =>
      p.event.status !== "DRAFT" &&
      p.responseStatus === "INVITED" &&
      canEditResponse({
        eventStatus: p.event.status,
        editUnlockedAt: p.editUnlockedAt,
      }),
  );
  const submitted = playerParticipations.filter(
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
            className="inline-block rounded bg-btn-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-btn-primary-hover"
          >
            New event
          </Link>
        </div>
      )}
      {nothingWaiting ? (
        <p className="text-sm text-hint">
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
                    organizerName={p.event.gmUser?.displayName}
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
                    organizerName={p.event.gmUser?.displayName}
                    status={p.event.status}
                    resultsHref={
                      p.event.resultsRevealedAt !== null
                        ? `/e/${p.eventId}/responses`
                        : undefined
                    }
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
                    organizerName={event.gmUser?.displayName}
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
