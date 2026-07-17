import type { PrismaClient } from "@prisma/client";
import type {
  UpsertWishlistItemRequest,
  WishlistItem,
} from "@ygo/contracts";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { getActiveRun } from "@/lib/run-service";

export async function listWishlistItems(
  prisma: PrismaClient,
  viewerId: string,
): Promise<WishlistItem[]> {
  const activeRun = await getActiveRun(prisma, viewerId);
  const [items, ownedGroups] = await Promise.all([
    prisma.campaignWishlistItem.findMany({
      where: { runId: activeRun.id, userId: viewerId },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      include: { card: true },
    }),
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
      where: { runId: activeRun.id, userId: viewerId },
      _count: { _all: true },
    }),
  ]);
  const ownedByCard = new Map(
    ownedGroups.map((group) => [group.cardId, group._count._all]),
  );

  return items.map((item) => {
    const ownedQuantity = ownedByCard.get(item.cardId) ?? 0;
    const missingQuantity = Math.max(0, item.desiredQuantity - ownedQuantity);

    return {
      id: item.id,
      cardId: item.cardId,
      name: item.card.name,
      imageUrl: getCardAssetUrl(item.card.externalCardId),
      desiredQuantity: item.desiredQuantity,
      ownedQuantity,
      missingQuantity,
      priority: item.priority,
      note: item.note,
      completed: missingQuantity === 0,
      updatedAt: item.updatedAt.toISOString(),
    };
  });
}

export async function upsertWishlistItem(
  prisma: PrismaClient,
  viewerId: string,
  input: UpsertWishlistItemRequest,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const card = await prisma.card.findUnique({ where: { id: input.cardId } });
  if (!card) throw new Error("Die ausgewählte Karte wurde nicht gefunden.");

  await prisma.campaignWishlistItem.upsert({
    where: {
      runId_userId_cardId: {
        runId: activeRun.id,
        userId: viewerId,
        cardId: input.cardId,
      },
    },
    update: {
      desiredQuantity: input.desiredQuantity,
      priority: input.priority,
      note: input.note?.trim() || null,
    },
    create: {
      runId: activeRun.id,
      userId: viewerId,
      cardId: input.cardId,
      desiredQuantity: input.desiredQuantity,
      priority: input.priority,
      note: input.note?.trim() || null,
    },
  });

  return listWishlistItems(prisma, viewerId);
}

export async function removeWishlistItem(
  prisma: PrismaClient,
  viewerId: string,
  itemId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const result = await prisma.campaignWishlistItem.deleteMany({
    where: { id: itemId, runId: activeRun.id, userId: viewerId },
  });
  if (result.count === 0) throw new Error("Wunschlisteneintrag wurde nicht gefunden.");
}
