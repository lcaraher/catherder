// Pure response-visibility and edit-lock rules: no framework, adapter, or
// I/O imports. Callers (pages, route handlers, server actions) must all go
// through these functions so the policy cannot drift between them.

export type EventStatus = "DRAFT" | "OPEN" | "CLOSED";

/**
 * Whether a participant may (re)submit their response. Editing follows the
 * event lifecycle only — never whether results are shared. An OPEN event is
 * always editable; a CLOSED event only with an organizer-granted unlock; a
 * DRAFT event never, unlock or not.
 */
export function canEditResponse({
  eventStatus,
  editUnlockedAt,
}: {
  eventStatus: EventStatus;
  editUnlockedAt: Date | null;
}): boolean {
  if (eventStatus === "OPEN") return true;
  if (eventStatus === "CLOSED") return editUnlockedAt !== null;
  return false;
}

/**
 * Whether a viewer may see other participants' responses, the overlap, and
 * the results. Organizers and the event's GameMaster always can; a plain
 * participant only once the organizer has revealed results.
 */
export function canViewOthersResponses({
  viewerIsOrganizerOrGm,
  resultsRevealedAt,
}: {
  viewerIsOrganizerOrGm: boolean;
  resultsRevealedAt: Date | null;
}): boolean {
  return viewerIsOrganizerOrGm || resultsRevealedAt !== null;
}

/**
 * A participant may always view their own submission, whatever the event
 * status or reveal state.
 */
export function canViewOwnResponse(): boolean {
  return true;
}
