import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { getImageStorage } from "@/adapters/images/storage";
import { canManageEvent } from "@/domain/event-access";

export const dynamic = "force-dynamic";

// One answer for every refusal, so the route never shows whether an event or a picture exists.
const notFound = () => new Response(null, { status: 404 });

// Serves an event picture to the event's participants and managers.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; imageId: string }> },
) {
  const { eventId, imageId } = await params;
  const user = await getSessionUser();
  if (!user) return notFound();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerUserId: true },
  });
  if (!event) return notFound();
  const image = await prisma.eventImage.findFirst({ where: { id: imageId, eventId }, select: { id: true } });
  if (!image) return notFound();

  const manager = canManageEvent({
    viewerUserId: user.id,
    organizerUserId: event.organizerUserId,
    viewerIsSiteAdmin: user.siteAdmin,
  });
  const allowed =
    manager ||
    (await prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
      select: { userId: true },
    })) !== null;
  if (!allowed) return notFound();

  let bytes: Buffer | null;
  try {
    bytes = await getImageStorage().read(eventId, imageId);
  } catch {
    return notFound();
  }
  if (!bytes) return notFound();
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(bytes.length),
    },
  });
}
