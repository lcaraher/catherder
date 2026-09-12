-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'TENTATIVE');

-- AlterTable
ALTER TABLE "EventAvailability" ADD COLUMN     "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "EventParticipant" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "StandingAvailability" ADD COLUMN     "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "availabilityNote" TEXT;
