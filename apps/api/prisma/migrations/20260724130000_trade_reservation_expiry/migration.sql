ALTER TABLE "Trade"
ADD COLUMN "reservationExpiresAt" TIMESTAMP(3);

CREATE INDEX "Trade_runId_status_reservationExpiresAt_idx"
ON "Trade"("runId", "status", "reservationExpiresAt");
