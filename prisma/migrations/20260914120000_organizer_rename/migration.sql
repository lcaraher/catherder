-- "GameMaster" leaves the schema: every event's owner is its Organizer, and
-- a per-event switch records whether the organizer also responds as a
-- participant. Renames only — no row data is rewritten. Plain PostgreSQL.

ALTER TABLE "Event" RENAME COLUMN "gmUserId" TO "organizerUserId";
ALTER INDEX "Event_gmUserId_idx" RENAME TO "Event_organizerUserId_idx";
ALTER TABLE "Event" RENAME CONSTRAINT "Event_gmUserId_fkey" TO "Event_organizerUserId_fkey";
ALTER TYPE "EventParticipantRole" RENAME VALUE 'GAMEMASTER' TO 'ORGANIZER';
ALTER TYPE "EventMode" RENAME VALUE 'GM_GROUPS' TO 'MULTI_GROUP';
ALTER TABLE "Event" ADD COLUMN "organizerParticipates" BOOLEAN NOT NULL DEFAULT false;

-- Dev-data fixes, in this order:
-- 1) Events whose owner joined as a PLAYER are the B6d-2 single activities
--    where the owner takes part; keep that behaviour via the new switch.
UPDATE "Event" e
SET "organizerParticipates" = true
FROM "EventParticipant" p
WHERE p."eventId" = e."id"
  AND p."userId" = e."organizerUserId"
  AND p."role" = 'PLAYER';

-- 2) The owner's participant row is role ORGANIZER on every event.
UPDATE "EventParticipant" p
SET "role" = 'ORGANIZER'
FROM "Event" e
WHERE p."eventId" = e."id"
  AND p."userId" = e."organizerUserId";
