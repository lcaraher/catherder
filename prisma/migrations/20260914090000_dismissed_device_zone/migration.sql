-- Remembers which detected device zone the user chose to ignore, so the
-- zone-mismatch banner stops nagging. Plain PostgreSQL only.
ALTER TABLE "User" ADD COLUMN "dismissedDeviceZone" TEXT;
