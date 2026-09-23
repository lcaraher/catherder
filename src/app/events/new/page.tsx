import { requireUser } from "@/adapters/auth";
import { Pane } from "@/components/pane";
import { NewEventForm } from "@/components/new-event-form";

export const dynamic = "force-dynamic";

export default async function FirstEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <Pane as="div" className="mb-6">
        <h1 className="text-2xl font-semibold">New event</h1>
      </Pane>
      <NewEventForm error={error} />
    </main>
  );
}
