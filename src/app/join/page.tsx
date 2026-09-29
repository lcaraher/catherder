import Link from "next/link";
import { Pane } from "@/components/pane";
import { JoinForm } from "@/components/join-form";

export const dynamic = "force-dynamic";

// Open to everyone: a person with a code but no account signs in on the way.
export default async function JoinPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Pane as="div" className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold">Join an event</h1>
        <p className="mb-6 text-sm font-medium text-hint">
          Type the code the organizer gave you. Capitals and hyphens do not
          matter.
        </p>
        <JoinForm />
        <p className="mt-6 text-sm">
          <Link href="/" className="text-hint">
            ← Home
          </Link>
        </p>
      </Pane>
    </main>
  );
}
