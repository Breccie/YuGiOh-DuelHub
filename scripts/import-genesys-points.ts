import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ErrataPolicy,
  FormatType,
  PrismaClient,
  Region,
} from "../apps/api/generated/prisma";

const prisma = new PrismaClient();

const dataPath = resolve(
  process.cwd(),
  "data",
  "banlists",
  "genesys-points-2026-06-23.json",
);

type GenesysPointFile = {
  source: string;
  sourceUrl: string;
  updated: string;
  effectiveFrom: string;
  pointLimit: number;
  entries: Array<{
    cardName: string;
    points: number;
  }>;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCardName(value: string) {
  return normalizeWhitespace(value)
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, "-")
    .toLowerCase();
}

function loadGenesysPoints() {
  if (!existsSync(dataPath)) {
    throw new Error(`Missing Genesys point file: ${dataPath}`);
  }

  const parsed = JSON.parse(readFileSync(dataPath, "utf8")) as GenesysPointFile;

  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error("Genesys point file contains no entries.");
  }

  return parsed;
}

async function main() {
  const pointFile = loadGenesysPoints();
  const effectiveFrom = new Date(`${pointFile.effectiveFrom}T00:00:00.000Z`);

  const cards = await prisma.card.findMany({
    select: {
      id: true,
      name: true,
    },
  });
  const cardIdByNormalizedName = new Map(
    cards.map((card) => [normalizeCardName(card.name), card.id]),
  );

  const formatProfile = await prisma.formatProfile.upsert({
    where: {
      slug: "genesys",
    },
    update: {
      name: "Genesys",
      type: FormatType.CUSTOM,
      region: Region.TCG,
      defaultErrataPolicy: ErrataPolicy.USE_LATEST_TEXT,
      description:
        "Official Konami Genesys point format. Deck construction uses a 100-point cap instead of the standard Forbidden & Limited list.",
    },
    create: {
      slug: "genesys",
      name: "Genesys",
      type: FormatType.CUSTOM,
      region: Region.TCG,
      startDate: effectiveFrom,
      defaultErrataPolicy: ErrataPolicy.USE_LATEST_TEXT,
      description:
        "Official Konami Genesys point format. Deck construction uses a 100-point cap instead of the standard Forbidden & Limited list.",
    },
  });

  const importResult = await prisma.$transaction(async (tx) => {
    const banlist = await tx.banlist.upsert({
      where: {
        formatProfileId_effectiveFrom: {
          formatProfileId: formatProfile.id,
          effectiveFrom,
        },
      },
      update: {
        name: `Genesys Points - ${pointFile.effectiveFrom}`,
        effectiveTo: null,
        errataPolicy: ErrataPolicy.USE_LATEST_TEXT,
        pointLimit: pointFile.pointLimit,
        notes: `${pointFile.source}. Updated ${pointFile.updated}. Source: ${pointFile.sourceUrl}`,
      },
      create: {
        formatProfileId: formatProfile.id,
        name: `Genesys Points - ${pointFile.effectiveFrom}`,
        effectiveFrom,
        effectiveTo: null,
        errataPolicy: ErrataPolicy.USE_LATEST_TEXT,
        pointLimit: pointFile.pointLimit,
        notes: `${pointFile.source}. Updated ${pointFile.updated}. Source: ${pointFile.sourceUrl}`,
      },
    });

    const unresolved: string[] = [];
    const resolvedRows = pointFile.entries.flatMap((entry) => {
      const cardId = cardIdByNormalizedName.get(normalizeCardName(entry.cardName));

      if (!cardId) {
        unresolved.push(entry.cardName);
        return [];
      }

      return {
        banlistId: banlist.id,
        cardId,
        allowedCopies: 3,
        pointValue: entry.points,
        note: `${pointFile.source}: ${entry.cardName}`,
      };
    });

    await tx.banlistEntry.deleteMany({
      where: {
        banlistId: banlist.id,
      },
    });

    for (let index = 0; index < resolvedRows.length; index += 500) {
      await tx.banlistEntry.createMany({
        data: resolvedRows.slice(index, index + 500),
      });
    }

    return {
      banlistName: banlist.name,
      importedEntries: resolvedRows.length,
      unresolvedEntries: unresolved.length,
      unresolvedPreview: unresolved.slice(0, 20),
    };
  });

  console.log(`Imported ${importResult.importedEntries} Genesys point entries.`);
  console.log(`Banlist: ${importResult.banlistName}`);

  if (importResult.unresolvedEntries > 0) {
    console.warn(
      `Unresolved Genesys entries: ${importResult.unresolvedEntries}. ` +
        importResult.unresolvedPreview.join(", "),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
