// Pure event-management access rules.

export interface EventAccessInput {
  viewerUserId: string;
  /** The event's Organizer. */
  organizerUserId: string;
  /** Whether the viewer has the site-admin flag. */
  viewerIsSiteAdmin: boolean;
}

/** A site admin may manage any event; otherwise only its Organizer may. */
export function canManageEvent({
  viewerUserId,
  organizerUserId,
  viewerIsSiteAdmin,
}: EventAccessInput): boolean {
  return viewerIsSiteAdmin || viewerUserId === organizerUserId;
}

/** True when the viewer can manage the event and is not its Organizer. */
export function isAdminOverride(input: EventAccessInput): boolean {
  return canManageEvent(input) && input.viewerUserId !== input.organizerUserId;
}
