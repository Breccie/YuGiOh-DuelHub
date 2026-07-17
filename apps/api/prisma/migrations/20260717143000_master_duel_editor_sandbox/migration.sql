CREATE TYPE "WishlistPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE "CampaignRuleVersionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'SUPERSEDED');
CREATE TYPE "CustomPackStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CustomPackEra" AS ENUM ('EARLY_TCG', 'GX_5DS', 'MODERN_CORE', 'PROMO_CUSTOM');

ALTER TABLE "PlayGroupRun" ADD COLUMN "activeRuleVersionId" TEXT;
ALTER TABLE "RewardGrant" ADD COLUMN "ruleVersionId" TEXT;
ALTER TABLE "PackOpening" ADD COLUMN "ruleVersionId" TEXT, ADD COLUMN "customPackVersionId" TEXT;
ALTER TABLE "PackOpeningBatch" ADD COLUMN "ruleVersionId" TEXT;
ALTER TABLE "RunProgressionCheckpoint" ADD COLUMN "ruleVersionId" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "ruleVersionId" TEXT;

CREATE TABLE "CampaignWishlistItem" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "desiredQuantity" INTEGER NOT NULL DEFAULT 1,
  "priority" "WishlistPriority" NOT NULL DEFAULT 'NORMAL',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignWishlistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignRuleVersion" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "CampaignRuleVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "presetKey" TEXT,
  "config" JSONB NOT NULL,
  "effectiveAt" TIMESTAMP(3),
  "effectiveCheckpointId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "CampaignRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomPackDefinition" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "era" "CustomPackEra" NOT NULL,
  "status" "CustomPackStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomPackDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomPackVersion" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "CustomPackStatus" NOT NULL DEFAULT 'DRAFT',
  "packSize" INTEGER NOT NULL DEFAULT 9,
  "displaySize" INTEGER NOT NULL DEFAULT 24,
  "price" INTEGER NOT NULL DEFAULT 100,
  "rewardOnly" BOOLEAN NOT NULL DEFAULT false,
  "slotConfig" JSONB NOT NULL,
  "generatedSetId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomPackVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomPackCardPoolEntry" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "setCardId" TEXT,
  "rarity" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomPackCardPoolEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomPackSlot" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "slotIndex" INTEGER NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "allowedRarities" JSONB NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "CustomPackSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignCustomPackAccess" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "price" INTEGER,
  "rewardOnly" BOOLEAN NOT NULL DEFAULT false,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignCustomPackAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomPackTemplate" (
  "id" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "sourceDefinitionId" TEXT,
  "name" TEXT NOT NULL,
  "era" "CustomPackEra" NOT NULL,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomPackTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignWishlistItem_runId_userId_cardId_key" ON "CampaignWishlistItem"("runId", "userId", "cardId");
CREATE INDEX "CampaignWishlistItem_runId_userId_updatedAt_idx" ON "CampaignWishlistItem"("runId", "userId", "updatedAt");
CREATE UNIQUE INDEX "CampaignRuleVersion_runId_version_key" ON "CampaignRuleVersion"("runId", "version");
CREATE INDEX "CampaignRuleVersion_runId_status_effectiveAt_idx" ON "CampaignRuleVersion"("runId", "status", "effectiveAt");
CREATE UNIQUE INDEX "PlayGroupRun_activeRuleVersionId_key" ON "PlayGroupRun"("activeRuleVersionId");
CREATE UNIQUE INDEX "CustomPackDefinition_runId_code_key" ON "CustomPackDefinition"("runId", "code");
CREATE INDEX "CustomPackDefinition_runId_status_updatedAt_idx" ON "CustomPackDefinition"("runId", "status", "updatedAt");
CREATE UNIQUE INDEX "CustomPackVersion_definitionId_version_key" ON "CustomPackVersion"("definitionId", "version");
CREATE INDEX "CustomPackVersion_definitionId_status_version_idx" ON "CustomPackVersion"("definitionId", "status", "version");
CREATE UNIQUE INDEX "CustomPackCardPoolEntry_versionId_cardId_rarity_setCardId_key" ON "CustomPackCardPoolEntry"("versionId", "cardId", "rarity", "setCardId");
CREATE INDEX "CustomPackCardPoolEntry_versionId_rarity_idx" ON "CustomPackCardPoolEntry"("versionId", "rarity");
CREATE UNIQUE INDEX "CustomPackSlot_versionId_slotIndex_key" ON "CustomPackSlot"("versionId", "slotIndex");
CREATE UNIQUE INDEX "CampaignCustomPackAccess_runId_versionId_key" ON "CampaignCustomPackAccess"("runId", "versionId");
CREATE INDEX "CampaignCustomPackAccess_runId_unlockedAt_idx" ON "CampaignCustomPackAccess"("runId", "unlockedAt");
CREATE INDEX "CustomPackTemplate_createdById_updatedAt_idx" ON "CustomPackTemplate"("createdById", "updatedAt");

ALTER TABLE "CampaignWishlistItem" ADD CONSTRAINT "CampaignWishlistItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignWishlistItem" ADD CONSTRAINT "CampaignWishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignWishlistItem" ADD CONSTRAINT "CampaignWishlistItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRuleVersion" ADD CONSTRAINT "CampaignRuleVersion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRuleVersion" ADD CONSTRAINT "CampaignRuleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomPackDefinition" ADD CONSTRAINT "CustomPackDefinition_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomPackDefinition" ADD CONSTRAINT "CustomPackDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomPackVersion" ADD CONSTRAINT "CustomPackVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomPackDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomPackCardPoolEntry" ADD CONSTRAINT "CustomPackCardPoolEntry_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CustomPackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomPackCardPoolEntry" ADD CONSTRAINT "CustomPackCardPoolEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomPackSlot" ADD CONSTRAINT "CustomPackSlot_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CustomPackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignCustomPackAccess" ADD CONSTRAINT "CampaignCustomPackAccess_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignCustomPackAccess" ADD CONSTRAINT "CampaignCustomPackAccess_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CustomPackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomPackTemplate" ADD CONSTRAINT "CustomPackTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomPackTemplate" ADD CONSTRAINT "CustomPackTemplate_sourceDefinitionId_fkey" FOREIGN KEY ("sourceDefinitionId") REFERENCES "CustomPackDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "CampaignRuleVersion" (
  "id", "runId", "version", "status", "presetKey", "config", "effectiveAt", "createdById", "createdAt", "activatedAt"
)
SELECT
  CONCAT('rulev1_', run."id"), run."id", 1, 'ACTIVE'::"CampaignRuleVersionStatus", 'CLASSIC_PROGRESSION',
  jsonb_build_object(
    'economy', jsonb_build_object('startingCredits', run."startingCredits", 'creditLimit', NULL, 'packPrice', run."defaultPackPrice", 'displaySize', run."defaultDisplaySize"),
    'progression', jsonb_build_object('initialSetUnlockCount', run."initialSetUnlockCount", 'setsPerStep', run."setsPerProgressionStep", 'freePacksPerSetUnlock', run."freePacksPerSetUnlock", 'separatePromoProgression', run."separatePromoProgression", 'catchUpMode', 'NONE'),
    'collection', jsonb_build_object('duplicateRule', 'KEEP_ALL', 'printingSpecificBinders', true, 'physicalCopyReservation', true),
    'decks', jsonb_build_object('allowProxies', false, 'minMainDeck', 40, 'maxMainDeck', 60, 'maxExtraDeck', 15, 'maxSideDeck', 15, 'tournamentDeckLock', true),
    'trades', jsonb_build_object('enabled', true, 'allowCredits', false, 'reservationMinutes', 1440),
    'tournaments', jsonb_build_object('matchMode', 'BEST_OF_THREE', 'requireResultConfirmation', true, 'winnerCredits', run."tournamentWinnerCredits", 'runnerUpCredits', run."tournamentRunnerUpCredits", 'participationCredits', run."tournamentParticipationCredits"),
    'audit', jsonb_build_object('requireReasonForChanges', true, 'activationMode', 'IMMEDIATE')
  ),
  run."createdAt", run."ownerId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PlayGroupRun" run;

UPDATE "PlayGroupRun" SET "activeRuleVersionId" = CONCAT('rulev1_', "id");
ALTER TABLE "PlayGroupRun" ADD CONSTRAINT "PlayGroupRun_activeRuleVersionId_fkey" FOREIGN KEY ("activeRuleVersionId") REFERENCES "CampaignRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
