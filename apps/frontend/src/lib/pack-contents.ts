import type { PrismaClient } from "@prisma/client";
import type { PackContentsResponse } from "@ygo/contracts";
import { getCardAssetUrl } from "@/lib/asset-urls";

const rarityPriority = [
  "quarter century",
  "starlight",
  "prismatic",
  "collector",
  "ghost",
  "ultimate",
  "secret",
  "ultra",
  "super",
  "rare",
  "common",
] as const;

export function getPackRarityRank(rarity: string) {
  const normalized = rarity.trim().toLowerCase();
  const rank = rarityPriority.findIndex((token) => normalized.includes(token));
  return rank === -1 ? rarityPriority.length : rank;
}

export function comparePackRarities(left: string, right: string) {
  return (
    getPackRarityRank(left) - getPackRarityRank(right) ||
    left.localeCompare(right, "de")
  );
}

export function groupPackContents(cards: PackContentsResponse["cards"]) {
  const groups = new Map<string, PackContentsResponse["cards"]>();

  for (const card of cards) {
    const rarity = card.rarity.trim() || "Common";
    const group = groups.get(rarity) ?? [];
    group.push(card);
    groups.set(rarity, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => comparePackRarities(left, right))
    .map(([rarity, groupCards]) => ({
      rarity,
      cards: [...groupCards].sort(
        (left, right) =>
          left.name.localeCompare(right.name, "de") ||
          (left.collectorNumber ?? "").localeCompare(
            right.collectorNumber ?? "",
            "de",
            { numeric: true },
          ),
      ),
    }));
}

export async function buildPackContentsPayload(
  prisma: PrismaClient,
  setId: string,
): Promise<PackContentsResponse | null> {
  const set = await prisma.cardSet.findUnique({
    where: { id: setId },
    select: {
      id: true,
      code: true,
      name: true,
      setCards: {
        select: {
          id: true,
          cardId: true,
          setCode: true,
          rarity: true,
          collectorNumber: true,
          card: {
            select: {
              name: true,
              externalCardId: true,
            },
          },
        },
      },
    },
  });

  if (!set) {
    return null;
  }

  return {
    set: {
      id: set.id,
      code: set.code,
      name: set.name,
    },
    cards: set.setCards
      .map((printing) => ({
        printingId: printing.id,
        cardId: printing.cardId,
        name: printing.card.name,
        imageUrl: getCardAssetUrl(printing.card.externalCardId),
        rarity: printing.rarity.trim() || "Common",
        setCode: printing.setCode,
        collectorNumber: printing.collectorNumber,
      }))
      .sort(
        (left, right) =>
          comparePackRarities(left.rarity, right.rarity) ||
          left.name.localeCompare(right.name, "de"),
      ),
  };
}
