-- CreateTable
CREATE TABLE "EventSharedTime" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startSlot" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL,
    "lengthSlots" INTEGER NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSharedTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventSharedTime_eventId_idx" ON "EventSharedTime"("eventId");

-- AddForeignKey
ALTER TABLE "EventSharedTime" ADD CONSTRAINT "EventSharedTime_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
