import { EntryLockState, type PrismaClient } from "@prisma/client";
import { DomainError } from "@ygo/domain";
import type { PublicProfile } from "@/lib/app-dtos";
import { getBinderCoverMeta } from "@/lib/collection-showcase-config";
import { getDeckBoxMeta } from "@/lib/deckbox-config";
import { getActiveRun } from "@/lib/run-service";
import { getMediaAssetUrl } from "@/lib/media-service";

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
      showcaseBinder: {
        select: {
          coverKey: true,
          coverAssetId: true,
          accentColor: true,
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

  const activeRun = await getActiveRun(prisma, user.id);
  const [acceptedFriendships, decks, collectionGroups] = await Promise.all([
    prisma.friendship.count({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: user.id }, { addresseeId: user.id }],
      },
    }),
    prisma.deck.findMany({
      where: {
        userId: user.id,
        runId: activeRun.id,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      include: {
        cards: {
          select: {
            section: true,
            quantity: true,
          },
        },
        formatProfile: {
          select: { name: true },
        },
        banlist: {
          select: { name: true },
        },
      },
    }),
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
      where: {
        userId: user.id,
        runId: activeRun.id,
        lockState: { not: EntryLockState.TRADED },
      },
      _count: { _all: true },
      orderBy: { cardId: "asc" },
    }),
  ]);
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
  const copies = collectionGroups.reduce(
    (sum, group) => sum + group._count._all,
    0,
  );
  const showcaseCover = user.showcaseBinder
    ? getBinderCoverMeta(user.showcaseBinder.coverKey)
    : null;

  return {
    userId: user.id,
    duelistId: user.duelistId,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    avatarAssetId: user.avatarAssetId ?? null,
    avatarImageUrl: getMediaAssetUrl(user.avatarAssetId),
    bio: user.bio ?? null,
    favoriteEra: user.favoriteEra ?? null,
    isPublic: user.isPublic,
    showcaseBinderId: user.showcaseBinderId ?? null,
    counts: {
      friends: acceptedFriendships,
      decks: decks.length,
      uniqueCards: collectionGroups.length,
      copies,
    },
    showcase: {
      binderName: user.showcaseSnapshot?.binderName ?? null,
      coverKey: user.showcaseBinder?.coverKey ?? null,
      coverName: showcaseCover?.name ?? null,
      coverImageUrl: showcaseCover?.imageUrl ?? null,
      coverAssetId: user.showcaseBinder?.coverAssetId ?? null,
      ...(user.showcaseBinder?.coverAssetId
        ? { coverImageUrl: getMediaAssetUrl(user.showcaseBinder.coverAssetId) }
        : {}),
      accentColor:
        user.showcaseBinder?.accentColor ?? showcaseCover?.accentColor ?? null,
      publishedAt: user.showcaseSnapshot?.publishedAt.toISOString() ?? null,
      highlightedCards,
    },
    decks: decks.map((deck) => {
      const counts = deck.cards.reduce(
        (summary, card) => {
          summary.cardCount += card.quantity;
          if (card.section === "MAIN") summary.mainCount += card.quantity;
          if (card.section === "EXTRA") summary.extraCount += card.quantity;
          if (card.section === "SIDE") summary.sideCount += card.quantity;
          return summary;
        },
        { cardCount: 0, mainCount: 0, extraCount: 0, sideCount: 0 },
      );
      const deckBox = getDeckBoxMeta(deck.deckBoxKey);

      return {
        id: deck.id,
        name: deck.name,
        deckBoxKey: deckBox.key,
        deckBoxAssetId: deck.deckBoxAssetId ?? null,
        deckBoxImageUrl: getMediaAssetUrl(deck.deckBoxAssetId) ?? deckBox.imageUrl,
        updatedAt: deck.updatedAt.toISOString(),
        ...counts,
        formatName: deck.formatProfile?.name ?? null,
        banlistName: deck.banlist?.name ?? null,
      };
    }),
  };
}
