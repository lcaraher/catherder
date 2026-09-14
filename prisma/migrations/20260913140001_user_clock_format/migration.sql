-- Per-user clock format for displaying times (12-hour vs 24-hour).
-- Plain PostgreSQL only.
CREATE TYPE "ClockFormat" AS ENUM ('TWELVE_HOUR', 'TWENTY_FOUR_HOUR');
ALTER TABLE "User" ADD COLUMN "clockFormat" "ClockFormat" NOT NULL DEFAULT 'TWELVE_HOUR';
