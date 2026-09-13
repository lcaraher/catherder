import { notFound } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { EventDestinationSelect } from "@/components/event-destination-select";
import { createEvent } from "../actions";

export const dynamic = "force-dynamic";

const inputClass =
  "w-full rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

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

  const [viewerMemberships, members] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: { select: { name: true } } },
      orderBy: { workspace: { name: "asc" } },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { user: { displayName: "asc" } },
    }),
  ]);
  // Any member may create an event here; a non-member gets a 404 so the page
  // never confirms the workspace exists.
  if (!viewerMemberships.some((m) => m.workspaceId === workspaceId)) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">New event</h1>
      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}
      <form action={createEvent} className="flex flex-col gap-4 text-sm">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        {viewerMemberships.length > 1 && (
          <div>
            <label
              htmlFor="destination"
              className="mb-1 block text-zinc-600 dark:text-zinc-400"
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
          <label htmlFor="name" className="mb-1 block text-zinc-600 dark:text-zinc-400">
            Name
          </label>
          <input id="name" name="name" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="mode" className="mb-1 block text-zinc-600 dark:text-zinc-400">
            Mode
          </label>
          <select id="mode" name="mode" className={inputClass}>
            <option value="GM_GROUPS">GameMaster groups</option>
            <option value="SINGLE_ACTIVITY">Single activity</option>
          </select>
        </div>
        <div>
          <label htmlFor="gmUserId" className="mb-1 block text-zinc-600 dark:text-zinc-400">
            GameMaster (GameMaster groups mode only — you, unless you pick
            someone else)
          </label>
          <select
            id="gmUserId"
            name="gmUserId"
            defaultValue={user.id}
            className={inputClass}
          >
            {members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="targetHours"
            className="mb-1 block text-zinc-600 dark:text-zinc-400"
          >
            Target session length (hours)
          </label>
          <input
            id="targetHours"
            name="targetHours"
            type="number"
            min={0.5}
            step={0.5}
            required
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">
            A starting point for grouping — you can change it later, and it
            does not limit what participants submit.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label
              htmlFor="minGroupSize"
              className="mb-1 block text-zinc-600 dark:text-zinc-400"
            >
              Min group size (optional)
            </label>
            <input
              id="minGroupSize"
              name="minGroupSize"
              type="number"
              min={1}
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label
              htmlFor="maxGroupSize"
              className="mb-1 block text-zinc-600 dark:text-zinc-400"
            >
              Max group size (optional)
            </label>
            <input
              id="maxGroupSize"
              name="maxGroupSize"
              type="number"
              min={1}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <button
            type="submit"
            className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500"
          >
            Create event
          </button>
        </div>
      </form>
    </main>
  );
}
