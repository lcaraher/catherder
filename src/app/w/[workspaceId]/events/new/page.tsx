import { requireRole } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
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
  await requireRole(workspaceId, ["OWNER", "ORGANIZER"]);

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: { user: { displayName: "asc" } },
  });

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
            GameMaster (required for GameMaster groups mode)
          </label>
          <select id="gmUserId" name="gmUserId" className={inputClass}>
            <option value="">—</option>
            {members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="requiredHours"
            className="mb-1 block text-zinc-600 dark:text-zinc-400"
          >
            Required consecutive hours
          </label>
          <input
            id="requiredHours"
            name="requiredHours"
            type="number"
            min={1}
            required
            className={inputClass}
          />
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
