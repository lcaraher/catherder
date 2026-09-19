import { notFound } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { NewEventForm } from "@/components/new-event-form";

export const dynamic = "force-dynamic";

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
      <NewEventForm
        workspaceId={workspaceId}
        destinations={viewerMemberships.map((m) => ({
          workspaceId: m.workspaceId,
          name: m.workspace.name,
        }))}
        error={error}
      />
    </main>
  );
}
