-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_workspaceId_fkey";

-- DropIndex
DROP INDEX "Event_workspaceId_idx";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "workspaceId";

-- DropForeignKey
ALTER TABLE "WorkspaceMember" DROP CONSTRAINT "WorkspaceMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "WorkspaceMember" DROP CONSTRAINT "WorkspaceMember_workspaceId_fkey";

-- DropTable
DROP TABLE "WorkspaceMember";

-- DropForeignKey
ALTER TABLE "Workspace" DROP CONSTRAINT "Workspace_ownerUserId_fkey";

-- DropTable
DROP TABLE "Workspace";

-- DropEnum
DROP TYPE "WorkspaceRole";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "siteAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Fails the migration when any event has no Organizer.
DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing FROM "Event" WHERE "organizerUserId" IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Events with a null organizerUserId: %', missing;
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_organizerUserId_fkey";

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "organizerUserId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
