-- Rename Event.requiredHours (whole hours) to requiredSlots (half-hour slots),
-- preserving data: 1 hour = 2 slots.
ALTER TABLE "Event" RENAME COLUMN "requiredHours" TO "requiredSlots";
UPDATE "Event" SET "requiredSlots" = "requiredSlots" * 2;
