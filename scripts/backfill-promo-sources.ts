import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { classifyPromoSource } from "../apps/frontend/src/lib/promo-source-classification";

const prisma = new PrismaClient();
const promoSourceOverridesPath = resolve(
  process.cwd(),
  "data",
  "import-overrides",
  "promo-sources.json",
);

type PromoSourceOverrideFile = {
  sources: Record<
    string,
    {
      label?: string;
      sourceType?: "PACK_REWARD" | "PROMO_CHOICE" | "FIXED_PROMO_GRANT" | "PRIZE_PROMO";
      claimMode?: "CHOOSE" | "RANDOM" | "FIXED" | "ORGANIZER_ONLY";
      availableFrom?: string | null;
      description?: string | null;
    }
  >;
};

function loadPromoSourceOverrides() {
  if (!existsSync(promoSourceOverridesPath)) {
    return new Map<string, PromoSourceOverrideFile["sources"][string]>();
  }

  const parsed = JSON.parse(
    readFileSync(promoSourceOverridesPath, "utf8"),
  ) as PromoSourceOverrideFile;

  return new Map(
    Object.entries(parsed.sources).map(([code, override]) => [
      code.toUpperCase(),
      override,
    ]),
  );
}

async function main() {
  const overrides = loadPromoSourceOverrides();
  const sets = await prisma.cardSet.findMany({
    include: {
      setCards: {
        select: {
          id: true,
          cardId: true,
          setCode: true,
        },
        orderBy: {
          setCode: "asc",
        },
      },
    },
    orderBy: {
      releaseDate: "asc",
    },
  });
  let sources = 0;
  let cards = 0;

  for (const set of sets) {
    const classification = classifyPromoSource(set, overrides.get(set.code));

    if (!classification) {
      continue;
    }

    const source = await prisma.promoSource.upsert({
      where: {
        code: classification.code,
      },
      create: {
        setId: set.id,
        code: classification.code,
        name: classification.name,
        description: classification.description,
        sourceType: classification.sourceType,
        claimMode: classification.claimMode,
        availableFrom: classification.availableFrom,
      },
      update: {
        setId: set.id,
        name: classification.name,
        description: classification.description,
        sourceType: classification.sourceType,
        claimMode: classification.claimMode,
        availableFrom: classification.availableFrom,
      },
    });

    for (const [index, setCard] of set.setCards.entries()) {
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
          cardId: setCard.cardId,
          sortOrder: index,
        },
        update: {
          cardId: setCard.cardId,
          sortOrder: index,
        },
      });
      cards += 1;
    }

    sources += 1;
  }

  console.log(`Backfilled ${sources} promo sources with ${cards} cards.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
