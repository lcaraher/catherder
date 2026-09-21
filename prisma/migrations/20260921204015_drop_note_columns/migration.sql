/*
  Warnings:

  - You are about to drop the column `note` on the `EventParticipant` table. All the data in the column will be lost.
  - You are about to drop the column `availabilityNote` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "EventParticipant" DROP COLUMN "note";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "availabilityNote";
