import Link from "next/link";
import { Pane } from "@/components/pane";
import { redirect } from "next/navigation";
import { requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { redeemInvite } from "@/adapters/db/invites";

export const dynamic = "force-dynamic";

export default async function JoinCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // Signing in brings the person straight back here.
  const user = await requireUser(`/join/${encodeURIComponent(code)}`);

  const result = await redeemInvite({ userId: user.id, rawCode: code });
  if (result.ok) {
    if (result.alreadyParticipant) {
      // An organizer who does not participate has no respond page; send them to manage it.
      const event = await prisma.event.findUnique({
        where: { id: result.eventId },
        select: {
          organizerUserId: true,
          organizerParticipates: true,
        },
      });
      if (
        event &&
        event.organizerUserId === user.id &&
        !event.organizerParticipates
      ) {
        redirect(`/e/${result.eventId}/manage`);
      }
    }
    redirect(`/e/${result.eventId}/respond`);
  }

  // Unknown, closed, and archived all read the same.
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Pane as="div">
      <div className="rounded border border-notice-error-border bg-notice-error px-3 py-2 text-sm text-notice-error-text">
        <p className="mb-2">This invite isn&rsquo;t valid right now.</p>
        <p className="flex items-center gap-4">
          <Link href="/join" className="underline">
            Try another code
          </Link>
          <Link href="/" className="underline">
            Back to the home page
          </Link>
        </p>
      </div>
      </Pane>
    </main>
  );
}
