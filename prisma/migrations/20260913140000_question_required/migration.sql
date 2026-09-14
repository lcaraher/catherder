-- Required questions: participants cannot submit without answering.
-- Plain PostgreSQL only.
ALTER TABLE "Question" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT false;
