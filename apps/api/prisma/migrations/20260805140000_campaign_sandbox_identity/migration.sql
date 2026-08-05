ALTER TYPE "MediaAssetKind" ADD VALUE 'CAMPAIGN_IMAGE';
ALTER TYPE "CreditLedgerSource" ADD VALUE 'TRADE_TRANSFER';
ALTER TYPE "CreditLedgerSource" ADD VALUE 'DUST_CONVERSION';
CREATE TYPE "RunJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "TournamentPairingMode" AS ENUM ('SWISS', 'ROUND_ROBIN', 'SINGLE_ELIMINATION', 'MANUAL');
CREATE TYPE "TournamentMatchMode" AS ENUM ('BEST_OF_ONE', 'BEST_OF_THREE', 'BEST_OF_FIVE');

ALTER TABLE "PlayGroupRun"
  ADD COLUMN "campaignImageAssetId" TEXT,
  ADD COLUMN "region" TEXT NOT NULL DEFAULT 'TCG',
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'de',
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "joinType" TEXT NOT NULL DEFAULT 'INVITE_CODE',
  ADD COLUMN "maxPlayers" INTEGER,
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3);

CREATE TABLE "RunJoinRequest" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "RunJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  CONSTRAINT "RunJoinRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RunJoinRequest_runId_userId_key" ON "RunJoinRequest"("runId", "userId");
CREATE INDEX "RunJoinRequest_runId_status_createdAt_idx" ON "RunJoinRequest"("runId", "status", "createdAt");
CREATE INDEX "RunJoinRequest_userId_status_createdAt_idx" ON "RunJoinRequest"("userId", "status", "createdAt");
ALTER TABLE "RunJoinRequest" ADD CONSTRAINT "RunJoinRequest_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunJoinRequest" ADD CONSTRAINT "RunJoinRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunJoinRequest" ADD CONSTRAINT "RunJoinRequest_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditWallet" ADD COLUMN "reservedBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TradeVersion"
  ADD COLUMN "offeredCredits" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "requestedCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trade"
  ADD COLUMN "requiresOrganizerApproval" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);
CREATE INDEX "Trade_runId_requiresOrganizerApproval_approvedAt_idx"
  ON "Trade"("runId", "requiresOrganizerApproval", "approvedAt");
ALTER TABLE "Trade"
  ADD CONSTRAINT "Trade_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Tournament"
  ADD COLUMN "pairingMode" "TournamentPairingMode" NOT NULL DEFAULT 'SWISS',
  ADD COLUMN "matchMode" "TournamentMatchMode" NOT NULL DEFAULT 'BEST_OF_THREE',
  ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "TournamentParticipant"
  ADD COLUMN "registeredDeckId" TEXT,
  ADD COLUMN "checkedInAt" TIMESTAMP(3);
CREATE INDEX "TournamentParticipant_registeredDeckId_idx" ON "TournamentParticipant"("registeredDeckId");
ALTER TABLE "TournamentParticipant"
  ADD CONSTRAINT "TournamentParticipant_registeredDeckId_fkey"
  FOREIGN KEY ("registeredDeckId") REFERENCES "Deck"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RewardGrant" ADD COLUMN "customPackVersionId" TEXT;
ALTER TABLE "Deck" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "RewardGrant_customPackVersionId_idx" ON "RewardGrant"("customPackVersionId");
ALTER TABLE "RewardGrant"
  ADD CONSTRAINT "RewardGrant_customPackVersionId_fkey"
  FOREIGN KEY ("customPackVersionId") REFERENCES "CustomPackVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "PlayGroupRun_visibility_status_idx" ON "PlayGroupRun"("visibility", "status");

ALTER TABLE "PlayGroupRun"
  ADD CONSTRAINT "PlayGroupRun_campaignImageAssetId_fkey"
  FOREIGN KEY ("campaignImageAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
