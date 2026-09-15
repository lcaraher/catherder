-- "Other" answers on choice questions, and audit snapshots of what a
-- destructive action removed. Plain PostgreSQL only.
ALTER TABLE "Question" ADD COLUMN "allowOther" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Answer" ADD COLUMN "otherText" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN "detail" JSONB;
