-- CreateEnum
CREATE TYPE "RunProgressionStatus" AS ENUM ('LOCKED', 'READY', 'APPLIED');

-- CreateEnum
CREATE TYPE "RunProgressionUnlockType" AS ENUM ('SET', 'PROMO_SOURCE', 'HISTORY_EVENT', 'REWARD');

-- CreateEnum
CREATE TYPE "PromoSourceType" AS ENUM ('PACK_REWARD', 'PROMO_CHOICE', 'FIXED_PROMO_GRANT', 'PRIZE_PROMO');

-- CreateEnum
CREATE TYPE "PromoClaimMode" AS ENUM ('CHOOSE', 'RANDOM', 'FIXED', 'ORGANIZER_ONLY');

-- CreateTable
CREATE TABLE "RunProgressionCheckpoint" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "unlockDate" TIMESTAMP(3),
    "requiredTournamentId" TEXT,
    "status" "RunProgressionStatus" NOT NULL DEFAULT 'LOCKED',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunProgressionCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunProgressionUnlock" (
    "id" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" "RunProgressionUnlockType" NOT NULL,
    "setId" TEXT,
    "promoSourceId" TEXT,
    "historyEventId" TEXT,
    "rewardConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunProgressionUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoSource" (
    "id" TEXT NOT NULL,
    "setId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" "PromoSourceType" NOT NULL DEFAULT 'PROMO_CHOICE',
    "claimMode" "PromoClaimMode" NOT NULL DEFAULT 'CHOOSE',
    "availableFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoSourceCard" (
    "id" TEXT NOT NULL,
    "promoSourceId" TEXT NOT NULL,
    "setCardId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PromoSourceCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunPromoAccess" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "promoSourceId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlockedById" TEXT,
    "sourceCheckpointId" TEXT,

    CONSTRAINT "RunPromoAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoClaim" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "promoSourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "setCardId" TEXT NOT NULL,
    "collectionEntryId" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RunProgressionCheckpoint_runId_sequence_key" ON "RunProgressionCheckpoint"("runId", "sequence");
CREATE INDEX "RunProgressionCheckpoint_runId_status_sequence_idx" ON "RunProgressionCheckpoint"("runId", "status", "sequence");
CREATE INDEX "RunProgressionCheckpoint_requiredTournamentId_idx" ON "RunProgressionCheckpoint"("requiredTournamentId");
CREATE INDEX "RunProgressionUnlock_checkpointId_type_idx" ON "RunProgressionUnlock"("checkpointId", "type");
CREATE INDEX "RunProgressionUnlock_runId_type_idx" ON "RunProgressionUnlock"("runId", "type");
CREATE INDEX "RunProgressionUnlock_setId_idx" ON "RunProgressionUnlock"("setId");
CREATE INDEX "RunProgressionUnlock_promoSourceId_idx" ON "RunProgressionUnlock"("promoSourceId");
CREATE UNIQUE INDEX "PromoSource_code_key" ON "PromoSource"("code");
CREATE INDEX "PromoSource_availableFrom_idx" ON "PromoSource"("availableFrom");
CREATE INDEX "PromoSource_sourceType_claimMode_idx" ON "PromoSource"("sourceType", "claimMode");
CREATE INDEX "PromoSource_setId_idx" ON "PromoSource"("setId");
CREATE UNIQUE INDEX "PromoSourceCard_promoSourceId_setCardId_key" ON "PromoSourceCard"("promoSourceId", "setCardId");
CREATE INDEX "PromoSourceCard_cardId_idx" ON "PromoSourceCard"("cardId");
CREATE INDEX "PromoSourceCard_setCardId_idx" ON "PromoSourceCard"("setCardId");
CREATE UNIQUE INDEX "RunPromoAccess_runId_promoSourceId_key" ON "RunPromoAccess"("runId", "promoSourceId");
CREATE INDEX "RunPromoAccess_promoSourceId_idx" ON "RunPromoAccess"("promoSourceId");
CREATE INDEX "RunPromoAccess_sourceCheckpointId_idx" ON "RunPromoAccess"("sourceCheckpointId");
CREATE INDEX "PromoClaim_runId_userId_claimedAt_idx" ON "PromoClaim"("runId", "userId", "claimedAt");
CREATE INDEX "PromoClaim_promoSourceId_setCardId_idx" ON "PromoClaim"("promoSourceId", "setCardId");
CREATE INDEX "PromoClaim_collectionEntryId_idx" ON "PromoClaim"("collectionEntryId");

-- AddForeignKey
ALTER TABLE "RunProgressionCheckpoint" ADD CONSTRAINT "RunProgressionCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunProgressionCheckpoint" ADD CONSTRAINT "RunProgressionCheckpoint_requiredTournamentId_fkey" FOREIGN KEY ("requiredTournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RunProgressionUnlock" ADD CONSTRAINT "RunProgressionUnlock_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "RunProgressionCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunProgressionUnlock" ADD CONSTRAINT "RunProgressionUnlock_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunProgressionUnlock" ADD CONSTRAINT "RunProgressionUnlock_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RunProgressionUnlock" ADD CONSTRAINT "RunProgressionUnlock_promoSourceId_fkey" FOREIGN KEY ("promoSourceId") REFERENCES "PromoSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RunProgressionUnlock" ADD CONSTRAINT "RunProgressionUnlock_historyEventId_fkey" FOREIGN KEY ("historyEventId") REFERENCES "HistoryEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromoSource" ADD CONSTRAINT "PromoSource_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromoSourceCard" ADD CONSTRAINT "PromoSourceCard_promoSourceId_fkey" FOREIGN KEY ("promoSourceId") REFERENCES "PromoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoSourceCard" ADD CONSTRAINT "PromoSourceCard_setCardId_fkey" FOREIGN KEY ("setCardId") REFERENCES "SetCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoSourceCard" ADD CONSTRAINT "PromoSourceCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunPromoAccess" ADD CONSTRAINT "RunPromoAccess_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunPromoAccess" ADD CONSTRAINT "RunPromoAccess_promoSourceId_fkey" FOREIGN KEY ("promoSourceId") REFERENCES "PromoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunPromoAccess" ADD CONSTRAINT "RunPromoAccess_unlockedById_fkey" FOREIGN KEY ("unlockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RunPromoAccess" ADD CONSTRAINT "RunPromoAccess_sourceCheckpointId_fkey" FOREIGN KEY ("sourceCheckpointId") REFERENCES "RunProgressionCheckpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromoClaim" ADD CONSTRAINT "PromoClaim_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoClaim" ADD CONSTRAINT "PromoClaim_promoSourceId_fkey" FOREIGN KEY ("promoSourceId") REFERENCES "PromoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoClaim" ADD CONSTRAINT "PromoClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoClaim" ADD CONSTRAINT "PromoClaim_setCardId_fkey" FOREIGN KEY ("setCardId") REFERENCES "SetCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoClaim" ADD CONSTRAINT "PromoClaim_collectionEntryId_fkey" FOREIGN KEY ("collectionEntryId") REFERENCES "CollectionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
