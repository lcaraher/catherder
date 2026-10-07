import Link from "next/link";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { myEventCards } from "@/domain/my-events";
import { Pane } from "@/components/pane";
import { PRIMARY } from "@/components/button-classes";
import { EventCard } from "@/components/event-card";
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
            createdAt: true,
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
        createdAt: true,
        organizerUser: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const cards = myEventCards({
    participations: participations.map((p) => ({
      role: p.role,
      responseStatus: p.responseStatus,
      editUnlockedAt: p.editUnlockedAt,
      event: {
        id: p.event.id,
        name: p.event.name,
        status: p.event.status,
        resultsRevealedAt: p.event.resultsRevealedAt,
        archivedAt: p.event.archivedAt,
        organizerParticipates: p.event.organizerParticipates,
        createdAt: p.event.createdAt,
        organizerName: p.event.organizerUser.displayName,
      },
    })),
    organized: organizedEvents.map((event) => ({
      id: event.id,
      name: event.name,
      status: event.status,
      archivedAt: event.archivedAt,
      createdAt: event.createdAt,
      organizerName: event.organizerUser.displayName,
    })),
  });
  const archivedOrganized = organizedEvents.filter(
    (event) => event.archivedAt !== null,
  );

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
      {cards.length === 0 ? (
        <p className="text-sm text-hint">
          Nothing is waiting for you right now — enjoy the quiet.
        </p>
      ) : (
        <Pane>
          <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">My Events</h2>
          <ul className="flex flex-col gap-2">
            {cards.map((card) => (
              <EventCard key={card.eventId} card={card} />
            ))}
          </ul>
        </Pane>
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
