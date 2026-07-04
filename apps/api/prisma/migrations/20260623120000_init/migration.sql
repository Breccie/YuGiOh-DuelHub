-- CreateEnum
CREATE TYPE "Region" AS ENUM ('TCG', 'OCG', 'GLOBAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CardKind" AS ENUM ('MONSTER', 'SPELL', 'TRAP', 'TOKEN');

-- CreateEnum
CREATE TYPE "OwnershipSource" AS ENUM ('PACK_OPENING', 'TRADE', 'ADMIN_IMPORT', 'MANUAL_GRANT');

-- CreateEnum
CREATE TYPE "EntryLockState" AS ENUM ('AVAILABLE', 'RESERVED', 'TRADED');

-- CreateEnum
CREATE TYPE "DeckSection" AS ENUM ('MAIN', 'EXTRA', 'SIDE');

-- CreateEnum
CREATE TYPE "CollectionLayoutMode" AS ENUM ('BINDER', 'GRID');

-- CreateEnum
CREATE TYPE "CollectionSortMode" AS ENUM ('MOST_COPIES', 'NEWEST_ACQUIRED', 'ALPHABETICAL', 'RARITY');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DuelRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'SCHEDULED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentParticipantStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'DROPPED');

-- CreateEnum
CREATE TYPE "TournamentRoundStatus" AS ENUM ('PENDING', 'PAIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TournamentMatchStatus" AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED', 'BYE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ErrataPolicy" AS ENUM ('USE_LATEST_TEXT', 'LOCK_TO_SNAPSHOT_TEXT', 'BAN_ON_ERRATA');

-- CreateEnum
CREATE TYPE "FormatType" AS ENUM ('PROGRESSION', 'CUSTOM', 'HISTORICAL', 'OPEN');

-- CreateEnum
CREATE TYPE "SetProductType" AS ENUM ('CORE_BOOSTER', 'BOOSTER', 'DECK', 'TIN', 'PROMO', 'SPECIAL', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "duelistId" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarKey" TEXT NOT NULL DEFAULT 'apprentice-sigil',
    "bio" TEXT,
    "favoriteEra" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "showcaseBinderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "userAgent" TEXT,
    "rememberDevice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "externalCardId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "CardKind" NOT NULL,
    "attribute" TEXT,
    "monsterType" TEXT,
    "levelRankLink" INTEGER,
    "atk" INTEGER,
    "def" INTEGER,
    "currentOracleText" TEXT,
    "currentPendulumText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardTextVersion" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "effectText" TEXT NOT NULL,
    "pendulumText" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isErrata" BOOLEAN NOT NULL DEFAULT false,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "sourceNote" TEXT,

    CONSTRAINT "CardTextVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardSet" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "region" "Region" NOT NULL,
    "productType" "SetProductType" NOT NULL DEFAULT 'UNKNOWN',
    "isOpenable" BOOLEAN NOT NULL DEFAULT true,
    "packSize" INTEGER NOT NULL DEFAULT 9,
    "imageUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetCard" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "setCode" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'Unknown',
    "collectorNumber" TEXT,
    "pullWeight" INTEGER NOT NULL DEFAULT 1,
    "isReprint" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SetCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackOpening" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "randomSeed" TEXT,
    "auditHash" TEXT,
    "notes" TEXT,

    CONSTRAINT "PackOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackPull" (
    "id" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "setCardId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "rarity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackPull_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "setCardId" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "OwnershipSource" NOT NULL,
    "sourceReferenceId" TEXT,
    "lockState" "EntryLockState" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,

    CONSTRAINT "CollectionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionBinder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coverKey" TEXT NOT NULL,
    "description" TEXT,
    "accentColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionBinder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionBinderPage" (
    "id" TEXT NOT NULL,
    "binderId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionBinderPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionBinderSlot" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "collectionEntryId" TEXT,
    "entryReferenceId" TEXT,
    "snapshotCardId" TEXT,
    "snapshotCardName" TEXT,
    "snapshotImageUrl" TEXT,
    "snapshotPrintingLabel" TEXT,
    "snapshotSetCode" TEXT,
    "snapshotRarity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionBinderSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "binderId" TEXT,
    "name" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL DEFAULT '',
    "kind" "CardKind",
    "duplicatesOnly" BOOLEAN NOT NULL DEFAULT false,
    "layoutMode" "CollectionLayoutMode" NOT NULL DEFAULT 'BINDER',
    "sortMode" "CollectionSortMode" NOT NULL DEFAULT 'MOST_COPIES',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormatProfile" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FormatType" NOT NULL,
    "region" "Region" NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "defaultErrataPolicy" "ErrataPolicy" NOT NULL DEFAULT 'BAN_ON_ERRATA',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormatProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banlist" (
    "id" TEXT NOT NULL,
    "formatProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "errataPolicy" "ErrataPolicy",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Banlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BanlistEntry" (
    "id" TEXT NOT NULL,
    "banlistId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "allowedCopies" INTEGER NOT NULL DEFAULT 3,
    "note" TEXT,

    CONSTRAINT "BanlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formatProfileId" TEXT,
    "banlistId" TEXT,
    "name" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckCard" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "section" "DeckSection" NOT NULL DEFAULT 'MAIN',
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "DeckCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "note" TEXT,
    "activeVersionId" TEXT,
    "acceptedVersionId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "proposerConfirmedAt" TIMESTAMP(3),
    "responderConfirmedAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "rejectedByUserId" TEXT,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeItem" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "collectionEntryId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,

    CONSTRAINT "TradeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeVersion" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "TradeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeVersionItem" (
    "id" TEXT NOT NULL,
    "tradeVersionId" TEXT NOT NULL,
    "collectionEntryId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,

    CONSTRAINT "TradeVersionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckExport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "exportPath" TEXT,
    "exportBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuelRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "requesterDeckId" TEXT,
    "exportId" TEXT,
    "tournamentMatchId" TEXT,
    "status" "DuelRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuelAppointment" (
    "id" TEXT NOT NULL,
    "duelRequestId" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'EDOPro',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuelAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "formatLabel" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentParticipant" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT,
    "status" "TournamentParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "seed" INTEGER,
    "joinedAt" TIMESTAMP(3),
    "droppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "TournamentRoundStatus" NOT NULL DEFAULT 'PAIRED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "tableNumber" INTEGER,
    "playerOneId" TEXT NOT NULL,
    "playerTwoId" TEXT,
    "playerOneDeckId" TEXT,
    "playerTwoDeckId" TEXT,
    "deckExportId" TEXT,
    "winnerId" TEXT,
    "playerOneScore" INTEGER NOT NULL DEFAULT 0,
    "playerTwoScore" INTEGER NOT NULL DEFAULT 0,
    "status" "TournamentMatchStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_duelistId_key" ON "User"("duelistId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_slug_key" ON "Card"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Card_externalCardId_key" ON "Card"("externalCardId");

-- CreateIndex
CREATE INDEX "CardTextVersion_cardId_effectiveFrom_idx" ON "CardTextVersion"("cardId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CardSet_code_key" ON "CardSet"("code");

-- CreateIndex
CREATE INDEX "SetCard_cardId_idx" ON "SetCard"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "SetCard_setId_setCode_rarity_key" ON "SetCard"("setId", "setCode", "rarity");

-- CreateIndex
CREATE INDEX "PackOpening_userId_openedAt_idx" ON "PackOpening"("userId", "openedAt");

-- CreateIndex
CREATE INDEX "PackPull_openingId_slotIndex_idx" ON "PackPull"("openingId", "slotIndex");

-- CreateIndex
CREATE INDEX "CollectionEntry_userId_cardId_idx" ON "CollectionEntry"("userId", "cardId");

-- CreateIndex
CREATE INDEX "CollectionBinder_userId_updatedAt_idx" ON "CollectionBinder"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CollectionBinderPage_binderId_updatedAt_idx" ON "CollectionBinderPage"("binderId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionBinderPage_binderId_pageIndex_key" ON "CollectionBinderPage"("binderId", "pageIndex");

-- CreateIndex
CREATE INDEX "CollectionBinderSlot_pageId_updatedAt_idx" ON "CollectionBinderSlot"("pageId", "updatedAt");

-- CreateIndex
CREATE INDEX "CollectionBinderSlot_collectionEntryId_idx" ON "CollectionBinderSlot"("collectionEntryId");

-- CreateIndex
CREATE INDEX "CollectionBinderSlot_entryReferenceId_idx" ON "CollectionBinderSlot"("entryReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionBinderSlot_pageId_slotIndex_key" ON "CollectionBinderSlot"("pageId", "slotIndex");

-- CreateIndex
CREATE INDEX "CollectionPreset_userId_updatedAt_idx" ON "CollectionPreset"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CollectionPreset_binderId_idx" ON "CollectionPreset"("binderId");

-- CreateIndex
CREATE UNIQUE INDEX "FormatProfile_slug_key" ON "FormatProfile"("slug");

-- CreateIndex
CREATE INDEX "Banlist_formatProfileId_effectiveFrom_idx" ON "Banlist"("formatProfileId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Banlist_formatProfileId_effectiveFrom_key" ON "Banlist"("formatProfileId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "BanlistEntry_banlistId_cardId_key" ON "BanlistEntry"("banlistId", "cardId");

-- CreateIndex
CREATE INDEX "Deck_userId_updatedAt_idx" ON "Deck"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeckCard_deckId_cardId_section_key" ON "DeckCard"("deckId", "cardId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_activeVersionId_key" ON "Trade"("activeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_acceptedVersionId_key" ON "Trade"("acceptedVersionId");

-- CreateIndex
CREATE INDEX "Trade_proposerId_proposedAt_idx" ON "Trade"("proposerId", "proposedAt");

-- CreateIndex
CREATE INDEX "Trade_responderId_proposedAt_idx" ON "Trade"("responderId", "proposedAt");

-- CreateIndex
CREATE INDEX "TradeItem_tradeId_idx" ON "TradeItem"("tradeId");

-- CreateIndex
CREATE INDEX "TradeItem_collectionEntryId_idx" ON "TradeItem"("collectionEntryId");

-- CreateIndex
CREATE INDEX "TradeVersion_tradeId_createdAt_idx" ON "TradeVersion"("tradeId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeVersion_senderId_recipientId_idx" ON "TradeVersion"("senderId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeVersion_tradeId_versionNumber_key" ON "TradeVersion"("tradeId", "versionNumber");

-- CreateIndex
CREATE INDEX "TradeVersionItem_tradeVersionId_idx" ON "TradeVersionItem"("tradeVersionId");

-- CreateIndex
CREATE INDEX "TradeVersionItem_collectionEntryId_idx" ON "TradeVersionItem"("collectionEntryId");

-- CreateIndex
CREATE INDEX "DeckExport_userId_createdAt_idx" ON "DeckExport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DeckExport_deckId_createdAt_idx" ON "DeckExport"("deckId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DuelRequest_tournamentMatchId_key" ON "DuelRequest"("tournamentMatchId");

-- CreateIndex
CREATE INDEX "DuelRequest_requesterId_createdAt_idx" ON "DuelRequest"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "DuelRequest_opponentId_createdAt_idx" ON "DuelRequest"("opponentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DuelAppointment_duelRequestId_key" ON "DuelAppointment"("duelRequestId");

-- CreateIndex
CREATE INDEX "Tournament_hostId_createdAt_idx" ON "Tournament"("hostId", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentParticipant_tournamentId_status_idx" ON "TournamentParticipant"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentParticipant_tournamentId_userId_key" ON "TournamentParticipant"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRound_tournamentId_roundNumber_key" ON "TournamentRound"("tournamentId", "roundNumber");

-- CreateIndex
CREATE INDEX "TournamentMatch_tournamentId_roundId_idx" ON "TournamentMatch"("tournamentId", "roundId");

-- CreateIndex
CREATE INDEX "TournamentMatch_playerOneId_playerTwoId_idx" ON "TournamentMatch"("playerOneId", "playerTwoId");

-- CreateIndex
CREATE INDEX "TournamentMatch_winnerId_idx" ON "TournamentMatch"("winnerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_showcaseBinderId_fkey" FOREIGN KEY ("showcaseBinderId") REFERENCES "CollectionBinder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTextVersion" ADD CONSTRAINT "CardTextVersion_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetCard" ADD CONSTRAINT "SetCard_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetCard" ADD CONSTRAINT "SetCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpening" ADD CONSTRAINT "PackOpening_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpening" ADD CONSTRAINT "PackOpening_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackPull" ADD CONSTRAINT "PackPull_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "PackOpening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackPull" ADD CONSTRAINT "PackPull_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackPull" ADD CONSTRAINT "PackPull_setCardId_fkey" FOREIGN KEY ("setCardId") REFERENCES "SetCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEntry" ADD CONSTRAINT "CollectionEntry_setCardId_fkey" FOREIGN KEY ("setCardId") REFERENCES "SetCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionBinder" ADD CONSTRAINT "CollectionBinder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionBinderPage" ADD CONSTRAINT "CollectionBinderPage_binderId_fkey" FOREIGN KEY ("binderId") REFERENCES "CollectionBinder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionBinderSlot" ADD CONSTRAINT "CollectionBinderSlot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CollectionBinderPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionBinderSlot" ADD CONSTRAINT "CollectionBinderSlot_collectionEntryId_fkey" FOREIGN KEY ("collectionEntryId") REFERENCES "CollectionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPreset" ADD CONSTRAINT "CollectionPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPreset" ADD CONSTRAINT "CollectionPreset_binderId_fkey" FOREIGN KEY ("binderId") REFERENCES "CollectionBinder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banlist" ADD CONSTRAINT "Banlist_formatProfileId_fkey" FOREIGN KEY ("formatProfileId") REFERENCES "FormatProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanlistEntry" ADD CONSTRAINT "BanlistEntry_banlistId_fkey" FOREIGN KEY ("banlistId") REFERENCES "Banlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanlistEntry" ADD CONSTRAINT "BanlistEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_formatProfileId_fkey" FOREIGN KEY ("formatProfileId") REFERENCES "FormatProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_banlistId_fkey" FOREIGN KEY ("banlistId") REFERENCES "Banlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCard" ADD CONSTRAINT "DeckCard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCard" ADD CONSTRAINT "DeckCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "TradeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_acceptedVersionId_fkey" FOREIGN KEY ("acceptedVersionId") REFERENCES "TradeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeItem" ADD CONSTRAINT "TradeItem_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeItem" ADD CONSTRAINT "TradeItem_collectionEntryId_fkey" FOREIGN KEY ("collectionEntryId") REFERENCES "CollectionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVersion" ADD CONSTRAINT "TradeVersion_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVersion" ADD CONSTRAINT "TradeVersion_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVersion" ADD CONSTRAINT "TradeVersion_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVersionItem" ADD CONSTRAINT "TradeVersionItem_tradeVersionId_fkey" FOREIGN KEY ("tradeVersionId") REFERENCES "TradeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeVersionItem" ADD CONSTRAINT "TradeVersionItem_collectionEntryId_fkey" FOREIGN KEY ("collectionEntryId") REFERENCES "CollectionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckExport" ADD CONSTRAINT "DeckExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckExport" ADD CONSTRAINT "DeckExport_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelRequest" ADD CONSTRAINT "DuelRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelRequest" ADD CONSTRAINT "DuelRequest_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelRequest" ADD CONSTRAINT "DuelRequest_requesterDeckId_fkey" FOREIGN KEY ("requesterDeckId") REFERENCES "Deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelRequest" ADD CONSTRAINT "DuelRequest_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "DeckExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelRequest" ADD CONSTRAINT "DuelRequest_tournamentMatchId_fkey" FOREIGN KEY ("tournamentMatchId") REFERENCES "TournamentMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelAppointment" ADD CONSTRAINT "DuelAppointment_duelRequestId_fkey" FOREIGN KEY ("duelRequestId") REFERENCES "DuelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRound" ADD CONSTRAINT "TournamentRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "TournamentRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_playerOneId_fkey" FOREIGN KEY ("playerOneId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_playerTwoId_fkey" FOREIGN KEY ("playerTwoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_playerOneDeckId_fkey" FOREIGN KEY ("playerOneDeckId") REFERENCES "Deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_playerTwoDeckId_fkey" FOREIGN KEY ("playerTwoDeckId") REFERENCES "Deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_deckExportId_fkey" FOREIGN KEY ("deckExportId") REFERENCES "DeckExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

