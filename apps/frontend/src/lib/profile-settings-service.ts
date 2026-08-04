import { Prisma, type PrismaClient } from "@prisma/client";
import type { UpdateProfileRequest } from "@ygo/contracts";
import { DomainError } from "@ygo/domain";
import { getCardAssetUrl, resolveAppImageUrl } from "@/lib/asset-urls";
import { getMediaAssetUrl, resolveOwnedMediaAsset } from "@/lib/media-service";

type ShowcaseCardSnapshot = {
  collectionEntryId: string | null;
  cardName: string | null;
  imageUrl: string | null;
  rarity: string | null;
  setCode: string | null;
};

export async function updateViewerProfile(
  prisma: PrismaClient,
  viewerId: string,
  input: UpdateProfileRequest,
) {
  return prisma.$transaction(async (tx) => {
    if (input.avatarAssetId !== undefined) {
      await resolveOwnedMediaAsset(tx as PrismaClient, viewerId, input.avatarAssetId, "AVATAR");
    }
    if (input.showcaseBinderId !== undefined) {
      const sourceBinderId = input.showcaseBinderId?.trim() || null;

      if (!sourceBinderId) {
        await tx.profileShowcaseSnapshot.deleteMany({ where: { userId: viewerId } });
      } else {
        const binder = await tx.collectionBinder.findFirst({
          where: {
            id: sourceBinderId,
            userId: viewerId,
            runId: { not: null },
          },
          include: {
            pages: {
              orderBy: { pageIndex: "asc" },
              include: {
                slots: {
                  orderBy: { slotIndex: "asc" },
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
        });

        if (!binder) {
          throw new DomainError({
            code: "showcase_binder_forbidden",
            message: "Als Showcase kann nur ein eigener Kampagnen-Binder veröffentlicht werden.",
            status: 403,
          });
        }

        const highlightedCards = binder.pages
          .flatMap((page) => page.slots)
          .filter((slot) => slot.collectionEntry || slot.snapshotCardName)
          .slice(0, 8)
          .map((slot): ShowcaseCardSnapshot => ({
            collectionEntryId: slot.collectionEntryId,
            cardName: slot.snapshotCardName ?? slot.collectionEntry?.card.name ?? null,
            imageUrl:
              resolveAppImageUrl(slot.snapshotImageUrl) ??
              getCardAssetUrl(slot.collectionEntry?.card.externalCardId ?? null) ??
              null,
            rarity: slot.snapshotRarity ?? slot.collectionEntry?.setCard?.rarity ?? null,
            setCode: slot.snapshotSetCode ?? slot.collectionEntry?.setCard?.setCode ?? null,
          }));

        await tx.profileShowcaseSnapshot.upsert({
          where: { userId: viewerId },
          create: {
            userId: viewerId,
            sourceBinderId: binder.id,
            binderName: binder.name,
            highlightedCards: highlightedCards as unknown as Prisma.InputJsonValue,
          },
          update: {
            sourceBinderId: binder.id,
            binderName: binder.name,
            highlightedCards: highlightedCards as unknown as Prisma.InputJsonValue,
            publishedAt: new Date(),
          },
        });
      }
    }

    return tx.user.update({
      where: { id: viewerId },
      data: {
        displayName: input.displayName,
        bio: input.bio === undefined ? undefined : input.bio?.trim() || null,
        favoriteEra:
          input.favoriteEra === undefined ? undefined : input.favoriteEra?.trim() || null,
        avatarKey: input.avatarKey,
        avatarAssetId: input.avatarAssetId,
        isPublic: input.isPublic,
        showcaseBinderId:
          input.showcaseBinderId === undefined
            ? undefined
            : input.showcaseBinderId?.trim() || null,
      },
      select: {
        id: true,
        duelistId: true,
        displayName: true,
        bio: true,
        favoriteEra: true,
        avatarKey: true,
        avatarAssetId: true,
        isPublic: true,
        showcaseBinderId: true,
      },
    }).then((profile) => ({
      ...profile,
      avatarImageUrl: getMediaAssetUrl(profile.avatarAssetId),
    }));
  });
}
