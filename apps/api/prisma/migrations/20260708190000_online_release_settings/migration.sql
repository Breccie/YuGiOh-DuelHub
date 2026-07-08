-- AlterEnum
ALTER TYPE "TournamentMatchStatus" ADD VALUE IF NOT EXISTS 'REPORTED';

-- AlterTable
ALTER TABLE "Banlist" ADD COLUMN IF NOT EXISTS "pointLimit" INTEGER;

-- AlterTable
ALTER TABLE "BanlistEntry" ADD COLUMN IF NOT EXISTS "pointValue" INTEGER;

-- AlterTable
ALTER TABLE "PlayGroupRun"
ADD COLUMN IF NOT EXISTS "freePacksPerSetUnlock" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN IF NOT EXISTS "tournamentParticipationCredits" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN IF NOT EXISTS "tournamentRunnerUpCredits" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN IF NOT EXISTS "tournamentWinnerCredits" INTEGER NOT NULL DEFAULT 300;

-- AlterTable
ALTER TABLE "TournamentMatch"
ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "confirmedById" TEXT,
ADD COLUMN IF NOT EXISTS "reportedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reportedById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TournamentMatch_reportedById_idx" ON "TournamentMatch"("reportedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TournamentMatch_confirmedById_idx" ON "TournamentMatch"("confirmedById");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TournamentMatch_reportedById_fkey'
  ) THEN
    ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TournamentMatch_confirmedById_fkey'
  ) THEN
    ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
