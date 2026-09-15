// Pure event-management access rules.

export interface EventAccessInput {
  viewerUserId: string;
  /** The event's Organizer, or null on legacy rows without one. */
  organizerUserId: string | null;
  /** Whether the viewer holds OWNER or ORGANIZER in the event's workspace. */
  viewerIsWorkspaceOrganizer: boolean;
}

/**
 * The event's Organizer and any workspace OWNER/ORGANIZER may manage it;
 * with no Organizer, only workspace admins qualify.
 */
export function canManageEvent({
  viewerUserId,
  organizerUserId,
  viewerIsWorkspaceOrganizer,
}: EventAccessInput): boolean {
  if (viewerIsWorkspaceOrganizer) return true;
  return organizerUserId !== null && viewerUserId === organizerUserId;
}

/**
 * True when a manager is not the event's Organizer and the event has one;
 * managing an Organizer-less event is not an override.
 */
export function isAdminOverride(input: EventAccessInput): boolean {
  return (
    canManageEvent(input) &&
    input.organizerUserId !== null &&
    input.viewerUserId !== input.organizerUserId
  );
}
