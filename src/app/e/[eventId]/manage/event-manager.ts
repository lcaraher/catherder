import { ForbiddenError, requireUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { canManageEvent } from "@/domain/event-access";

// Every action re-authorizes server-side; forms only decide what's
// visible. Management facts come from the database, never from IdP claims.
export async function requireEventManager(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("event not found");
  const user = await requireUser();
  const allowed = canManageEvent({
    viewerUserId: user.id,
    organizerUserId: event.organizerUserId,
    viewerIsSiteAdmin: user.siteAdmin,
  });
  if (!allowed) {
    throw new ForbiddenError("not allowed to manage this event");
  }
  return { event, user };
}
