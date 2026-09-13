-- Response visibility and edit locks.
-- Event.resultsRevealedAt: when set, results are visible to participants too
-- (null = organizers and the event's GameMaster only).
-- EventParticipant.editUnlockedAt: organizer-granted unlock that lets this
-- participant keep editing after results are revealed (null = no unlock).
ALTER TABLE "Event" ADD COLUMN "resultsRevealedAt" TIMESTAMP(3);
ALTER TABLE "EventParticipant" ADD COLUMN "editUnlockedAt" TIMESTAMP(3);
