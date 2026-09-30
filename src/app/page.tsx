import Link from "next/link";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { canEditResponse } from "@/domain/response-access";
import { Pane } from "@/components/pane";
import { PRIMARY } from "@/components/button-classes";
import { EventRow } from "@/components/event-row";
import { Logo } from "@/components/logo";
import { Wordmark } from "@/components/wordmark";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 rounded-card border-2 accent-gradient-border card-glow px-8 py-7 text-center max-sm:w-full max-sm:px-5">
          <Logo size={72} />
          <h1 className="letter-hop font-wordmark text-4xl font-extrabold sm:text-5xl">
            <Wordmark />
          </h1>
          {/* Place subtitle text here later. <p className="max-w-xs text-hint">Place subtitle text here later.</p> */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 max-sm:flex-col max-sm:items-stretch max-sm:self-stretch">
            <a href="/login" className={`${PRIMARY} no-underline text-center`}>
              Sign in
            </a>
            <Link
              href="/join"
              className="font-small text-sm font-medium nav-comet no-underline max-sm:self-center"
            >
              Have an invite code?
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const [participations, organizedEvents] = await Promise.all([
    prisma.eventParticipant.findMany({
      where: { userId: user.id },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            status: true,
            resultsRevealedAt: true,
            archivedAt: true,
            organizerParticipates: true,
            organizerUser: { select: { displayName: true } },
          },
        },
      },
      orderBy: { event: { createdAt: "desc" } },
    }),
    prisma.event.findMany({
      where: { organizerUserId: user.id },
      select: {
        id: true,
        name: true,
        status: true,
        archivedAt: true,
        organizerUser: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // A non-participating organizer never appears in the response lists;
  // their events are under "Events you run" instead. Archived events leave
  // every list; only the owner keeps them, under "Archived" at the bottom.
  const playerParticipations = participations.filter(
    (p) =>
      p.event.archivedAt === null &&
      (p.role !== "ORGANIZER" || p.event.organizerParticipates),
  );
  const needsResponse = playerParticipations.filter(
    (p) =>
      p.event.status !== "DRAFT" &&
      p.responseStatus === "INVITED" &&
      canEditResponse({
        eventStatus: p.event.status,
        editUnlockedAt: p.editUnlockedAt,
        archivedAt: p.event.archivedAt,
      }),
  );
  const submitted = playerParticipations.filter(
    (p) => p.responseStatus === "SUBMITTED",
  );
  const activeOrganized = organizedEvents.filter(
    (event) => event.archivedAt === null,
  );
  const archivedOrganized = organizedEvents.filter(
    (event) => event.archivedAt !== null,
  );

  const nothingWaiting =
    needsResponse.length === 0 &&
    submitted.length === 0 &&
    activeOrganized.length === 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="sr-only">Your events</h1>
      {/* Every signed-in person may start an event. */}
      <div className="mb-6">
        <Link
          href="/events/new"
          className={`${PRIMARY} no-underline inline-block text-sm`}
        >
          New event
        </Link>
      </div>
      {nothingWaiting ? (
        <p className="text-sm text-hint">
          Nothing is waiting for you right now — enjoy the quiet.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {needsResponse.length > 0 && (
            <Pane>
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Needs your response</h2>
              <ul className="flex flex-col gap-2">
                {needsResponse.map((p) => (
                  <EventRow
                    key={p.eventId}
                    href={`/e/${p.eventId}/respond`}
                    name={p.event.name}
                    organizerName={p.event.organizerUser?.displayName}
                    status={p.event.status}
                  />
                ))}
              </ul>
            </Pane>
          )}

          {submitted.length > 0 && (
            <Pane>
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Your responses</h2>
              <ul className="flex flex-col gap-2">
                {submitted.map((p) => {
                  const editable = canEditResponse({
                    eventStatus: p.event.status,
                    editUnlockedAt: p.editUnlockedAt,
                    archivedAt: p.event.archivedAt,
                  });
                  return (
                    <EventRow
                      key={p.eventId}
                      href={`/e/${p.eventId}/respond`}
                      name={p.event.name}
                      organizerName={p.event.organizerUser?.displayName}
                      status={p.event.status}
                      resultsHref={
                        p.event.resultsRevealedAt !== null
                          ? `/e/${p.eventId}/responses`
                          : undefined
                      }
                      note={
                        editable ? "Your response can still be changed." : "Locked"
                      }
                      notePencil={editable}
                    />
                  );
                })}
              </ul>
            </Pane>
          )}

          {activeOrganized.length > 0 && (
            <Pane>
              <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Events you run</h2>
              <ul className="flex flex-col gap-2">
                {activeOrganized.map((event) => (
                  <EventRow
                    key={event.id}
                    href={`/e/${event.id}/manage`}
                    name={event.name}
                    organizerName={event.organizerUser?.displayName}
                    status={event.status}
                  />
                ))}
              </ul>
            </Pane>
          )}

        </div>
      )}

      {archivedOrganized.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-lg font-medium">
            Archived
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {archivedOrganized.map((event) => (
              <EventRow
                key={event.id}
                href={`/e/${event.id}/manage`}
                name={event.name}
                organizerName={event.organizerUser?.displayName}
                status={event.status}
                note="Archived"
              />
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
