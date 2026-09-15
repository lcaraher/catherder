-- Event description (Markdown) and archiving. Plain PostgreSQL only.
ALTER TABLE "Event" ADD COLUMN "description" TEXT;
ALTER TABLE "Event" ADD COLUMN "archivedAt" TIMESTAMP(3);
