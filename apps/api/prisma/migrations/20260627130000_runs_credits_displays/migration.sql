-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RunRole" AS ENUM ('OWNER', 'ORGANIZER', 'PLAYER');

-- CreateEnum
CREATE TYPE "CreditLedgerSource" AS ENUM ('STARTING_BALANCE', 'PACK_PURCHASE', 'DISPLAY_PURCHASE', 'DUEL_REWARD', 'TOURNAMENT_REWARD', 'ORGANIZER_ADJUSTMENT', 'MANUAL_GRANT');

-- CreateEnum
CREATE TYPE "PackOpeningBatchType" AS ENUM ('SINGLE_PACK', 'DISPLAY', 'REWARD');

-- CreateEnum
CREATE TYPE "HistoryEventType" AS ENUM ('WORLD_CHAMPIONSHIP', 'NATIONALS', 'TOURNAMENT_PACK_PERIOD', 'SET_RELEASE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RewardGrantStatus" AS ENUM ('PENDING', 'CLAIMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "activeRunId" TEXT;

-- AlterTable
ALTER TABLE "PackOpening" ADD COLUMN "runId" TEXT,
ADD COLUMN "batchId" TEXT;

-- AlterTable
ALTER TABLE "CollectionEntry" ADD COLUMN "runId" TEXT;

-- AlterTable
ALTER TABLE "CollectionBinder" ADD COLUMN "runId" TEXT;

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN "runId" TEXT;

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN "runId" TEXT;

-- AlterTable
ALTER TABLE "DuelRequest" ADD COLUMN "runId" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "runId" TEXT;

-- CreateTable
CREATE TABLE "PlayGroupRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'ACTIVE',
    "historyCursor" TIMESTAMP(3),
    "defaultPackPrice" INTEGER NOT NULL DEFAULT 100,
    "defaultDisplaySize" INTEGER NOT NULL DEFAULT 24,
    "startingCredits" INTEGER NOT NULL DEFAULT 2400,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayGroupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunMembership" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RunRole" NOT NULL DEFAULT 'PLAYER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditWallet" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "source" "CreditLedgerSource" NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunSetUnlock" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "packPrice" INTEGER,
    "displaySize" INTEGER,
    "rewardOnly" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "RunSetUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "HistoryEventType" NOT NULL DEFAULT 'CUSTOM',
    "eventDate" TIMESTAMP(3),
    "isUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "rewardConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardGrant" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "grantedById" TEXT,
    "amountCredits" INTEGER NOT NULL DEFAULT 0,
    "packSetId" TEXT,
    "packQuantity" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "status" "RewardGrantStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "RewardGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackOpeningBatch" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "type" "PackOpeningBatchType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "totalCost" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackOpeningBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayGroupRun_ownerId_status_idx" ON "PlayGroupRun"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RunMembership_runId_userId_key" ON "RunMembership"("runId", "userId");

-- CreateIndex
CREATE INDEX "RunMembership_userId_joinedAt_idx" ON "RunMembership"("userId", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditWallet_runId_userId_key" ON "CreditWallet"("runId", "userId");

-- CreateIndex
CREATE INDEX "CreditWallet_userId_updatedAt_idx" ON "CreditWallet"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerEntry_runId_userId_idempotencyKey_key" ON "CreditLedgerEntry"("runId", "userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_walletId_createdAt_idx" ON "CreditLedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_runId_createdAt_idx" ON "CreditLedgerEntry"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RunSetUnlock_runId_setId_key" ON "RunSetUnlock"("runId", "setId");

-- CreateIndex
CREATE INDEX "RunSetUnlock_setId_idx" ON "RunSetUnlock"("setId");

-- CreateIndex
CREATE INDEX "HistoryEvent_runId_eventDate_idx" ON "HistoryEvent"("runId", "eventDate");

-- CreateIndex
CREATE INDEX "RewardGrant_runId_recipientId_status_idx" ON "RewardGrant"("runId", "recipientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PackOpeningBatch_runId_userId_idempotencyKey_key" ON "PackOpeningBatch"("runId", "userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PackOpeningBatch_runId_createdAt_idx" ON "PackOpeningBatch"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "PackOpeningBatch_userId_createdAt_idx" ON "PackOpeningBatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PackOpening_runId_openedAt_idx" ON "PackOpening"("runId", "openedAt");

-- CreateIndex
CREATE INDEX "PackOpening_batchId_idx" ON "PackOpening"("batchId");

-- CreateIndex
CREATE INDEX "CollectionEntry_runId_userId_cardId_idx" ON "CollectionEntry"("runId", "userId", "cardId");

-- CreateIndex
CREATE INDEX "CollectionBinder_runId_updatedAt_idx" ON "CollectionBinder"("runId", "updatedAt");

-- CreateIndex
CREATE INDEX "Deck_runId_userId_updatedAt_idx" ON "Deck"("runId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Trade_runId_proposedAt_idx" ON "Trade"("runId", "proposedAt");

-- CreateIndex
CREATE INDEX "DuelRequest_runId_createdAt_idx" ON "DuelRequest"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "Tournament_runId_createdAt_idx" ON "Tournament"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeRunId_fkey" FOREIGN KEY ("activeRunId") REFERENCES "PlayGroupRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayGroupRun" ADD CONSTRAINT "PlayGroupRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunMembership" ADD CONSTRAINT "RunMembership_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunMembership" ADD CONSTRAINT "RunMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditWallet" ADD CONSTRAINT "CreditWallet_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditWallet" ADD CONSTRAINT "CreditWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CreditWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunSetUnlock" ADD CONSTRAINT "RunSetUnlock_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunSetUnlock" ADD CONSTRAINT "RunSetUnlock_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryEvent" ADD CONSTRAINT "HistoryEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_packSetId_fkey" FOREIGN KEY ("packSetId") REFERENCES "CardSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpeningBatch" ADD CONSTRAINT "PackOpeningBatch_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpeningBatch" ADD CONSTRAINT "PackOpeningBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpeningBatch" ADD CONSTRAINT "PackOpeningBatch_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpening" ADD CONSTRAINT "PackOpening_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpening" ADD CONSTRAINT "PackOpening_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PackOpeningBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionBinder" ADD CONSTRAINT "CollectionBinder_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelRequest" ADD CONSTRAINT "DuelRequest_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
