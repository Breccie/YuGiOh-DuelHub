import type { PrismaClient } from "@prisma/client";
import { DomainError } from "@ygo/domain";
import type { PublicProfile } from "@/lib/app-dtos";

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
      showcaseSnapshot: true,
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
  const highlightedCards = Array.isArray(user.showcaseSnapshot?.highlightedCards)
    ? user.showcaseSnapshot.highlightedCards.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const card = value as Record<string, unknown>;
        return [{
          collectionEntryId:
            typeof card.collectionEntryId === "string" ? card.collectionEntryId : null,
          cardName: typeof card.cardName === "string" ? card.cardName : null,
          imageUrl: typeof card.imageUrl === "string" ? card.imageUrl : null,
          rarity: typeof card.rarity === "string" ? card.rarity : null,
          setCode: typeof card.setCode === "string" ? card.setCode : null,
        }];
      })
    : [];
  const uniqueCards = new Set(
    highlightedCards.map((card) => card.cardName).filter(Boolean),
  ).size;

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
      decks: 0,
      uniqueCards,
      copies: highlightedCards.length,
    },
    showcase: {
      binderName: user.showcaseSnapshot?.binderName ?? null,
      highlightedCards,
    },
    decks: [],
  };
}
