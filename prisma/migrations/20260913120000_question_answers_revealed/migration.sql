-- Per-question participant visibility for answers. Plain PostgreSQL only.
ALTER TABLE "Question" ADD COLUMN "answersRevealed" BOOLEAN NOT NULL DEFAULT false;
