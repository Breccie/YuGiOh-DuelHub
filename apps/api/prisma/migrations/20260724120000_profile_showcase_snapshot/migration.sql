CREATE TABLE "ProfileShowcaseSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceBinderId" TEXT,
    "binderName" TEXT NOT NULL,
    "highlightedCards" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileShowcaseSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfileShowcaseSnapshot_userId_key"
ON "ProfileShowcaseSnapshot"("userId");

CREATE INDEX "ProfileShowcaseSnapshot_publishedAt_idx"
ON "ProfileShowcaseSnapshot"("publishedAt");

ALTER TABLE "ProfileShowcaseSnapshot"
ADD CONSTRAINT "ProfileShowcaseSnapshot_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProfileShowcaseSnapshot" (
    "id",
    "userId",
    "sourceBinderId",
    "binderName",
    "highlightedCards",
    "publishedAt",
    "updatedAt"
)
SELECT
    'showcase-' || u."id",
    u."id",
    b."id",
    b."name",
    COALESCE((
        SELECT jsonb_agg(card_snapshot)
        FROM (
            SELECT jsonb_build_object(
                'collectionEntryId', s."collectionEntryId",
                'cardName', COALESCE(s."snapshotCardName", c."name"),
                'imageUrl', s."snapshotImageUrl",
                'rarity', COALESCE(s."snapshotRarity", sc."rarity"),
                'setCode', COALESCE(s."snapshotSetCode", sc."setCode")
            ) AS card_snapshot
            FROM "CollectionBinderPage" p
            JOIN "CollectionBinderSlot" s ON s."pageId" = p."id"
            LEFT JOIN "CollectionEntry" ce ON ce."id" = s."collectionEntryId"
            LEFT JOIN "Card" c ON c."id" = ce."cardId"
            LEFT JOIN "SetCard" sc ON sc."id" = ce."setCardId"
            WHERE p."binderId" = b."id"
              AND (s."snapshotCardName" IS NOT NULL OR s."collectionEntryId" IS NOT NULL)
            ORDER BY p."pageIndex", s."slotIndex"
            LIMIT 8
        ) snapshots
    ), '[]'::jsonb),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
JOIN "CollectionBinder" b ON b."id" = u."showcaseBinderId";
