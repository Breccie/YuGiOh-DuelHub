CREATE TYPE "AuctionStatus" AS ENUM ('OPEN', 'SETTLED', 'CANCELLED', 'NO_SALE');

CREATE TABLE "Auction" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "collectionEntryId" TEXT NOT NULL,
  "status" "AuctionStatus" NOT NULL DEFAULT 'OPEN',
  "startingBid" INTEGER NOT NULL,
  "minIncrement" INTEGER NOT NULL DEFAULT 1,
  "currentBid" INTEGER,
  "highestBidderId" TEXT,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "settledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuctionBid" (
  "id" TEXT NOT NULL,
  "auctionId" TEXT NOT NULL,
  "bidderId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Auction_runId_status_endsAt_idx" ON "Auction"("runId", "status", "endsAt");
CREATE INDEX "Auction_sellerId_createdAt_idx" ON "Auction"("sellerId", "createdAt");
CREATE INDEX "Auction_highestBidderId_idx" ON "Auction"("highestBidderId");
CREATE INDEX "Auction_collectionEntryId_status_idx" ON "Auction"("collectionEntryId", "status");
CREATE INDEX "AuctionBid_auctionId_amount_createdAt_idx" ON "AuctionBid"("auctionId", "amount", "createdAt");
CREATE INDEX "AuctionBid_bidderId_createdAt_idx" ON "AuctionBid"("bidderId", "createdAt");

ALTER TABLE "Auction" ADD CONSTRAINT "Auction_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "PlayGroupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_collectionEntryId_fkey"
  FOREIGN KEY ("collectionEntryId") REFERENCES "CollectionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_highestBidderId_fkey"
  FOREIGN KEY ("highestBidderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionId_fkey"
  FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_bidderId_fkey"
  FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
