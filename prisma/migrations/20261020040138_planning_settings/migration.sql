-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "planningMinPeople" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "planningNearlySlots" INTEGER,
ADD COLUMN     "planningOrganizerMustAttend" BOOLEAN NOT NULL DEFAULT false;
