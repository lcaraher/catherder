import { redirect } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { NewEventForm } from "@/components/new-event-form";

export const dynamic = "force-dynamic";

export default async function FirstEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();

  // A member creates inside a workspace; that route handles the destination picker.
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
    orderBy: { workspace: { name: "asc" } },
  });
  if (membership) {
    redirect(`/w/${membership.workspaceId}/events/new`);
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">New event</h1>
      <NewEventForm workspaceId={null} destinations={[]} error={error} />
    </main>
  );
}
