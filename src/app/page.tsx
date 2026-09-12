import Link from "next/link";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <h1 className="text-3xl font-semibold">catherder</h1>
      </main>
    );
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: { select: { id: true, name: true } } },
    orderBy: { workspace: { name: "asc" } },
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Your workspaces</h1>
      {memberships.length === 0 ? (
        <p className="text-sm text-zinc-500">
          You are not a member of any workspace yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {memberships.map((membership) => (
            <li key={membership.workspaceId}>
              <Link
                href={`/w/${membership.workspaceId}`}
                className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">{membership.workspace.name}</span>
                <span className="text-xs text-zinc-500">{membership.role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
