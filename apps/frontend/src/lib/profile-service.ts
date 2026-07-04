import "server-only";

import type { PrismaClient } from "@prisma/client";
import { DomainError } from "@ygo/domain";
import type { PublicProfile } from "@/lib/app-dtos";
import { getCardAssetUrl, resolveAppImageUrl } from "@/lib/asset-urls";

export async function getPublicProfileByDuelistId(
  prisma: PrismaClient,
  duelistId: string,
  viewerId?: string | null,
): Promise<PublicProfile> {
  const normalized = duelistId.trim().toUpperCase();
  const user = await prisma.user.findUnique({
    where: {
      duelistId: normalized,
    },
    include: {
      showcaseBinder: {
        include: {
          pages: {
            orderBy: {
              pageIndex: "asc",
            },
            include: {
              slots: {
                orderBy: {
                  slotIndex: "asc",
                },
                include: {
                  collectionEntry: {
                    include: {
                      card: true,
                      setCard: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      decks: {
        orderBy: {
          updatedAt: "desc",
        },
        take: 6,
        include: {
          formatProfile: true,
          banlist: true,
          cards: true,
        },
      },
    },
  });

  if (!user) {
    throw new DomainError({
      code: "not_found",
      message: "Profil wurde nicht gefunden.",
      status: 404,
    });
  }

  if (!user.isPublic && user.id !== viewerId) {
    throw new DomainError({
      code: "profile_private",
      message: "Dieses Profil ist aktuell nicht öffentlich.",
      status: 403,
    });
  }

  const acceptedFriendships = await prisma.friendship.count({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: user.id }, { addresseeId: user.id }],
    },
  });
  const [uniqueCards, copies] = await Promise.all([
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
      where: {
        userId: user.id,
      },
    }),
    prisma.collectionEntry.count({
      where: {
        userId: user.id,
      },
    }),
  ]);

  const highlightedCards =
    user.showcaseBinder?.pages
      .flatMap((page) => page.slots)
      .filter((slot) => slot.collectionEntry || slot.snapshotCardName)
      .slice(0, 8)
      .map((slot) => ({
        collectionEntryId: slot.collectionEntryId,
        cardName: slot.collectionEntry?.card.name ?? slot.snapshotCardName ?? null,
        imageUrl:
          getCardAssetUrl(slot.collectionEntry?.card.externalCardId ?? null) ??
          resolveAppImageUrl(slot.snapshotImageUrl) ??
          null,
        rarity: slot.collectionEntry?.setCard?.rarity ?? slot.snapshotRarity ?? null,
        setCode: slot.collectionEntry?.setCard?.setCode ?? slot.snapshotSetCode ?? null,
      })) ?? [];

  return {
    userId: user.id,
    duelistId: user.duelistId,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    bio: user.bio ?? null,
    favoriteEra: user.favoriteEra ?? null,
    isPublic: user.isPublic,
    showcaseBinderId: user.showcaseBinderId ?? null,
    counts: {
      friends: acceptedFriendships,
      decks: user.decks.length,
      uniqueCards: uniqueCards.length,
      copies,
    },
    showcase: {
      binderName: user.showcaseBinder?.name ?? null,
      highlightedCards,
    },
    decks: user.decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      updatedAt: deck.updatedAt.toISOString(),
      cardCount: deck.cards.reduce((total, card) => total + card.quantity, 0),
      formatName: deck.formatProfile?.name ?? null,
      banlistName: deck.banlist?.name ?? null,
    })),
  };
}
