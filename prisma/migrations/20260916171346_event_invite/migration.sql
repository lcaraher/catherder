-- CreateTable
CREATE TABLE "EventInvite" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regeneratedAt" TIMESTAMP(3),

    CONSTRAINT "EventInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventInvite_eventId_key" ON "EventInvite"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventInvite_code_key" ON "EventInvite"("code");

-- CreateIndex
CREATE INDEX "EventInvite_createdByUserId_idx" ON "EventInvite"("createdByUserId");

-- AddForeignKey
ALTER TABLE "EventInvite" ADD CONSTRAINT "EventInvite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvite" ADD CONSTRAINT "EventInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
