CREATE TYPE "PackAvailabilityStatus" AS ENUM ('AVAILABLE', 'LOCKED', 'SCHEDULED');

ALTER TABLE "RunSetUnlock"
  ADD COLUMN "availabilityStatus" "PackAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "availableFrom" TIMESTAMP(3),
  ADD COLUMN "availableUntil" TIMESTAMP(3),
  ADD COLUMN "updatedById" TEXT,
  ADD COLUMN "statusReason" TEXT;

ALTER TABLE "CampaignCustomPackAccess"
  ADD COLUMN "availabilityStatus" "PackAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "availableFrom" TIMESTAMP(3),
  ADD COLUMN "availableUntil" TIMESTAMP(3),
  ADD COLUMN "updatedById" TEXT,
  ADD COLUMN "statusReason" TEXT;

ALTER TABLE "Tournament" ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE TABLE "TournamentResult" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "duelistId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "matchPoints" INTEGER NOT NULL,
  "wins" INTEGER NOT NULL,
  "losses" INTEGER NOT NULL,
  "draws" INTEGER NOT NULL,
  "byes" INTEGER NOT NULL,
  "opponentsMatchWinRate" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentDeckSnapshot" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deckId" TEXT,
  "deckName" TEXT,
  "cards" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentDeckSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentMvpCard" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "featuredUserId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "note" TEXT,
  "selectedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentMvpCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentResult_tournamentId_userId_key" ON "TournamentResult"("tournamentId", "userId");
CREATE INDEX "TournamentResult_tournamentId_rank_idx" ON "TournamentResult"("tournamentId", "rank");
CREATE INDEX "TournamentResult_userId_rank_idx" ON "TournamentResult"("userId", "rank");
CREATE UNIQUE INDEX "TournamentDeckSnapshot_tournamentId_userId_key" ON "TournamentDeckSnapshot"("tournamentId", "userId");
CREATE INDEX "TournamentDeckSnapshot_userId_createdAt_idx" ON "TournamentDeckSnapshot"("userId", "createdAt");
CREATE UNIQUE INDEX "TournamentMvpCard_tournamentId_position_key" ON "TournamentMvpCard"("tournamentId", "position");
CREATE INDEX "TournamentMvpCard_tournamentId_featuredUserId_idx" ON "TournamentMvpCard"("tournamentId", "featuredUserId");
CREATE INDEX "TournamentMvpCard_cardId_idx" ON "TournamentMvpCard"("cardId");

ALTER TABLE "TournamentResult"
  ADD CONSTRAINT "TournamentResult_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentDeckSnapshot"
  ADD CONSTRAINT "TournamentDeckSnapshot_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentMvpCard"
  ADD CONSTRAINT "TournamentMvpCard_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentMvpCard"
  ADD CONSTRAINT "TournamentMvpCard_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
