import { notFound } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { EventDestinationSelect } from "@/components/event-destination-select";
import { NewEventFields } from "@/components/new-event-fields";
import { createEvent } from "../actions";

export const dynamic = "force-dynamic";

const inputClass =
  "w-full rounded border border-edge-strong bg-field px-3 py-2 text-sm";

export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { workspaceId } = await params;
  const { error } = await searchParams;
  const user = await requireUser();

  const viewerMemberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: { select: { name: true } } },
    orderBy: { workspace: { name: "asc" } },
  });
  // Any member may create an event here; a non-member gets a 404 so the page
  // never confirms the workspace exists.
  if (!viewerMemberships.some((m) => m.workspaceId === workspaceId)) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">New event</h1>
      {error && (
        <p className="mb-4 rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
          {error}
        </p>
      )}
      <form action={createEvent} className="flex flex-col gap-4 text-sm">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        {viewerMemberships.length > 1 && (
          <div>
            <label
              htmlFor="destination"
              className="mb-1 block text-muted"
            >
              Create in
            </label>
            <EventDestinationSelect
              id="destination"
              currentWorkspaceId={workspaceId}
              options={viewerMemberships.map((m) => ({
                workspaceId: m.workspaceId,
                name: m.workspace.name,
              }))}
            />
          </div>
        )}
        <div>
          <label htmlFor="name" className="mb-1 block text-muted">
            Name
          </label>
          <input id="name" name="name" required className={inputClass} />
        </div>
        <NewEventFields />
        <div>
          <button
            type="submit"
            className="rounded bg-btn-primary px-4 py-2 font-medium text-on-primary hover:bg-btn-primary-hover"
          >
            Create event
          </button>
        </div>
      </form>
    </main>
  );
}
