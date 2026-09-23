-- AlterTable
ALTER TABLE "User" ALTER COLUMN "theme" SET DEFAULT 'aurora';

-- Accounts on a theme key that no longer exists move to the default.
UPDATE "User" SET "theme" = 'aurora' WHERE "theme" NOT IN ('aurora','light','chillpill','regal');
