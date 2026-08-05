import { OwnershipSource, type Prisma } from "@prisma/client";
import { getActiveCampaignRuleConfig } from "@/lib/campaign-rule-service";
import { creditWallet } from "@/lib/run-service";

type PulledCard = {
  cardId: string;
  setCardId: string | null;
  sourceReferenceId: string | null;
};

export async function addPulledCardsToCollection(
  tx: Prisma.TransactionClient,
  options: { runId: string; userId: string; pulls: PulledCard[] },
) {
  if (options.pulls.length === 0) return { kept: 0, converted: 0 };
  const rules = (await getActiveCampaignRuleConfig(tx, options.runId)).collection;
  const cardIds = [...new Set(options.pulls.map((pull) => pull.cardId))];
  const [totalEntries, grouped] = await Promise.all([
    tx.collectionEntry.count({
      where: { runId: options.runId, userId: options.userId, lockState: { not: "TRADED" } },
    }),
    tx.collectionEntry.groupBy({
      by: ["cardId"],
      where: {
        runId: options.runId,
        userId: options.userId,
        lockState: { not: "TRADED" },
        cardId: { in: cardIds },
      },
      _count: { _all: true },
    }),
  ]);
  const copiesByCard = new Map(grouped.map((row) => [row.cardId, row._count._all]));
  const copyCap = !rules.allowPackDuplicates
    ? 1
    : rules.duplicateRule === "KEEP_ALL"
      ? null
      : rules.maxCopiesPerCard ?? 3;
  let remainingCapacity = rules.collectionEntryLimit === null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, rules.collectionEntryLimit - totalEntries);
  const kept: PulledCard[] = [];
  let converted = 0;

  for (const pull of options.pulls) {
    const currentCopies = copiesByCard.get(pull.cardId) ?? 0;
    if ((copyCap !== null && currentCopies >= copyCap) || remainingCapacity <= 0) {
      converted += 1;
      continue;
    }
    kept.push(pull);
    copiesByCard.set(pull.cardId, currentCopies + 1);
    remainingCapacity -= 1;
  }

  if (kept.length > 0) {
    await tx.collectionEntry.createMany({
      data: kept.map((pull) => ({
        userId: options.userId,
        runId: options.runId,
        cardId: pull.cardId,
        setCardId: pull.setCardId,
        source: OwnershipSource.PACK_OPENING,
        sourceReferenceId: pull.sourceReferenceId,
      })),
    });
  }

  if (converted > 0 && rules.dustingEnabled && rules.dustingCreditsPerCard > 0) {
    await creditWallet(tx, {
      runId: options.runId,
      userId: options.userId,
      amount: converted * rules.dustingCreditsPerCard,
      source: "DUST_CONVERSION",
      referenceType: "PackOpening",
      referenceId: options.pulls[0]?.sourceReferenceId ?? null,
      note: `${converted} überschüssige Karten automatisch in Credits umgewandelt.`,
    });
  }

  return { kept: kept.length, converted };
}
