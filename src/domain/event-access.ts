// Pure event-management access rules: no framework, adapter, or I/O imports.
// The event's GameMaster runs their own event; a workspace OWNER/ORGANIZER
// can also manage it, acting as a visible admin override.

export interface EventAccessInput {
  viewerUserId: string;
  /** The event's GameMaster, or null for events without one (SINGLE_ACTIVITY). */
  gmUserId: string | null;
  /** Whether the viewer holds OWNER or ORGANIZER in the event's workspace. */
  viewerIsWorkspaceOrganizer: boolean;
}

/**
 * Whether the viewer may manage this event: its GameMaster always can, and a
 * workspace OWNER/ORGANIZER always can. For an event with no GameMaster only
 * the workspace organizers qualify.
 */
export function canManageEvent({
  viewerUserId,
  gmUserId,
  viewerIsWorkspaceOrganizer,
}: EventAccessInput): boolean {
  if (viewerIsWorkspaceOrganizer) return true;
  return gmUserId !== null && viewerUserId === gmUserId;
}

/**
 * Whether the viewer is managing someone else's event: they may manage it,
 * they are not its GameMaster, and the event has one. Managing an event that
 * has no GameMaster is ordinary organizer work, not an override.
 */
export function isAdminOverride(input: EventAccessInput): boolean {
  return (
    canManageEvent(input) &&
    input.gmUserId !== null &&
    input.viewerUserId !== input.gmUserId
  );
}
