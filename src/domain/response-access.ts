// Pure response-visibility and edit-lock rules.

export type EventStatus = "DRAFT" | "OPEN" | "CLOSED";

/**
 * Whether a participant may (re)submit: OPEN always, CLOSED only with an
 * unlock, DRAFT never. Sharing results never affects editing.
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
 * Managers always see others' responses, the overlap, and the results; a
 * plain participant only once results are revealed.
 */
export function canViewOthersResponses({
  viewerIsManager,
  resultsRevealedAt,
}: {
  viewerIsManager: boolean;
  resultsRevealedAt: Date | null;
}): boolean {
  return viewerIsManager || resultsRevealedAt !== null;
}

/** A participant may always view their own submission. */
export function canViewOwnResponse(): boolean {
  return true;
}

/**
 * Managers always see a question's answers; a participant needs both the
 * event's results and this question's answers revealed.
 */
export function canViewQuestionAnswers({
  viewerIsManager,
  resultsRevealedAt,
  answersRevealed,
}: {
  viewerIsManager: boolean;
  resultsRevealedAt: Date | null;
  answersRevealed: boolean;
}): boolean {
  if (viewerIsManager) return true;
  return resultsRevealedAt !== null && answersRevealed;
}
