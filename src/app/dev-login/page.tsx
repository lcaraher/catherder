import { notFound } from "next/navigation";
import { isDevIssuerEnabled, safeReturnPath } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";

export const dynamic = "force-dynamic";

export default async function DevLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isDevIssuerEnabled()) notFound();
  const next = safeReturnPath((await searchParams).next);
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <main className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold">Dev login</h1>
        <p className="mb-6 text-sm text-hint">
          Development-only issuer. Pick a user to sign in as.
        </p>
        <ul className="flex flex-col gap-2">
          {users.map((user) => (
            <li key={user.id}>
              <form method="post" action="/api/dev-auth/login">
                <input type="hidden" name="userId" value={user.id} />
                {next && <input type="hidden" name="next" value={next} />}
                <button
                  type="submit"
                  className="w-full rounded border border-edge-strong px-4 py-2 text-left hover:bg-btn-secondary-hover"
                >
                  <span className="font-medium">{user.displayName}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
