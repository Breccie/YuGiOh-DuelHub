CREATE TYPE "MediaAssetKind" AS ENUM ('AVATAR', 'PACK_ARTWORK', 'PACK_IMAGE', 'BINDER_COVER', 'DECKBOX');
CREATE TYPE "MediaStorageProvider" AS ENUM ('LOCAL', 'SUPABASE');

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "kind" "MediaAssetKind" NOT NULL,
  "name" TEXT NOT NULL,
  "storageProvider" "MediaStorageProvider" NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "avatarAssetId" TEXT;
ALTER TABLE "CollectionBinder" ADD COLUMN "coverAssetId" TEXT;
ALTER TABLE "Deck" ADD COLUMN "deckBoxAssetId" TEXT;
ALTER TABLE "CustomPackVersion" ADD COLUMN "artworkAssetId" TEXT;
ALTER TABLE "CustomPackVersion" ADD COLUMN "packImageAssetId" TEXT;

CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");
CREATE INDEX "MediaAsset_ownerId_kind_createdAt_idx" ON "MediaAsset"("ownerId", "kind", "createdAt");

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionBinder" ADD CONSTRAINT "CollectionBinder_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_deckBoxAssetId_fkey" FOREIGN KEY ("deckBoxAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomPackVersion" ADD CONSTRAINT "CustomPackVersion_artworkAssetId_fkey" FOREIGN KEY ("artworkAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomPackVersion" ADD CONSTRAINT "CustomPackVersion_packImageAssetId_fkey" FOREIGN KEY ("packImageAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
