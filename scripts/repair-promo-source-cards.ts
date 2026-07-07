import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const knownPromoSetCards: Record<
  string,
  Array<{
    externalCardId: string;
    setCode: string;
    rarity: string;
    collectorNumber: string;
  }>
> = {
  PCY: [
    {
      externalCardId: "59744639",
      setCode: "PCY-001",
      rarity: "Prismatic Secret Rare",
      collectorNumber: "001",
    },
    {
      externalCardId: "58921041",
      setCode: "PCY-002",
      rarity: "Prismatic Secret Rare",
      collectorNumber: "002",
    },
    {
      externalCardId: "63391643",
      setCode: "PCY-003",
      rarity: "Prismatic Secret Rare",
      collectorNumber: "003",
    },
    {
      externalCardId: "46986414",
      setCode: "PCY-004",
      rarity: "Prismatic Secret Rare",
      collectorNumber: "004",
    },
    {
      externalCardId: "40640057",
      setCode: "PCY-005",
      rarity: "Prismatic Secret Rare",
      collectorNumber: "005",
    },
  ],
  YUCB: [
    {
      externalCardId: "46986414",
      setCode: "YUCB-EN001",
      rarity: "Ultra Rare",
      collectorNumber: "EN001",
    },
  ],
  KACB: [
    {
      externalCardId: "89631139",
      setCode: "KACB-EN001",
      rarity: "Ultra Rare",
      collectorNumber: "EN001",
    },
  ],
  ADC1: [
    {
      externalCardId: "46986414",
      setCode: "ADC1-EN001",
      rarity: "Prismatic Secret Rare",
      collectorNumber: "EN001",
    },
  ],
};

async function repairSet(setCode: string) {
  const set = await prisma.cardSet.findUnique({
    where: {
      code: setCode,
    },
    include: {
      promoSources: true,
    },
  });

  if (!set) {
    return {
      setCode,
      setCards: 0,
      promoSourceCards: 0,
      skipped: "set_not_found",
    };
  }

  let repairedSetCards = 0;
  let repairedPromoSourceCards = 0;

  for (const [index, fallbackCard] of knownPromoSetCards[setCode]!.entries()) {
    const card = await prisma.card.findUnique({
      where: {
        externalCardId: fallbackCard.externalCardId,
      },
    });

    if (!card) {
      throw new Error(
        `Card ${fallbackCard.externalCardId} for ${setCode} (${fallbackCard.setCode}) is missing.`,
      );
    }

    const setCard = await prisma.setCard.upsert({
      where: {
        setId_setCode_rarity: {
          setId: set.id,
          setCode: fallbackCard.setCode,
          rarity: fallbackCard.rarity,
        },
      },
      create: {
        setId: set.id,
        cardId: card.id,
        setCode: fallbackCard.setCode,
        rarity: fallbackCard.rarity,
        collectorNumber: fallbackCard.collectorNumber,
        pullWeight: 1,
        isReprint: true,
      },
      update: {
        cardId: card.id,
        collectorNumber: fallbackCard.collectorNumber,
        pullWeight: 1,
        isReprint: true,
      },
    });
    repairedSetCards += 1;

    for (const source of set.promoSources) {
      await prisma.promoSourceCard.upsert({
        where: {
          promoSourceId_setCardId: {
            promoSourceId: source.id,
            setCardId: setCard.id,
          },
        },
        create: {
          promoSourceId: source.id,
          setCardId: setCard.id,
          cardId: card.id,
          sortOrder: index,
        },
        update: {
          cardId: card.id,
          sortOrder: index,
        },
      });
      repairedPromoSourceCards += 1;
    }
  }

  return {
    setCode,
    setCards: repairedSetCards,
    promoSourceCards: repairedPromoSourceCards,
  };
}

async function main() {
  const repaired = [];

  for (const setCode of Object.keys(knownPromoSetCards)) {
    repaired.push(await repairSet(setCode));
  }

  console.log(JSON.stringify({ repaired }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
