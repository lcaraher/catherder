import Link from "next/link";
import { openInviteCode } from "./actions";

export const dynamic = "force-dynamic";

// Open to everyone: a person with a code but no account signs in on the way.
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold">Join an event</h1>
        <p className="mb-6 text-sm text-hint">
          Type the code the organizer gave you. Capitals and hyphens do not
          matter.
        </p>
        {error && (
          <p className="mb-4 rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
            {error}
          </p>
        )}
        <form action={openInviteCode} className="flex flex-col gap-3 text-sm">
          <label htmlFor="code" className="text-muted">
            Invite code
          </label>
          <input
            id="code"
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCDE-FGHJK"
            className="w-full rounded border border-edge-strong bg-field px-3 py-2 font-mono text-base tracking-wider"
          />
          <div>
            <button
              type="submit"
              className="rounded bg-btn-primary px-4 py-2 font-medium text-on-primary hover:bg-btn-primary-hover"
            >
              Continue
            </button>
          </div>
        </form>
        <p className="mt-6 text-sm">
          <Link href="/" className="text-hint hover:underline">
            ← Home
          </Link>
        </p>
      </div>
    </main>
  );
}
