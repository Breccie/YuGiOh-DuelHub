import type { PrismaClient } from "@prisma/client";
import type { DeckExportResult } from "@/lib/app-dtos";
import { requirePlayableDeck } from "@/lib/deck-legality";
import { getActiveRun } from "@/lib/run-service";

function sanitizeFileStem(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "deck-export";
}

function expandCardIds(cardIds: string[], quantity: number) {
  return Array.from({ length: quantity }, () => cardIds[0] ?? "").filter(Boolean);
}

function ensureYdkCardCode(cardCode: string | null | undefined, cardName: string) {
  if (!cardCode || !/^\d+$/.test(cardCode)) {
    throw new Error(
      `Die Karte "${cardName}" hat keine gültige Karten-ID für einen .ydk-Export.`,
    );
  }

  return cardCode;
}

export async function createDeckExport(
  prisma: PrismaClient,
  viewerId: string,
  deckId: string,
  options?: {
    exportPath?: string | null;
    fileName?: string | null;
    linkedDuelRequestId?: string | null;
    linkedTournamentMatchId?: string | null;
  },
): Promise<DeckExportResult> {
  const activeRun = await getActiveRun(prisma, viewerId);
  await requirePlayableDeck(prisma, viewerId, deckId);
  const deck = await prisma.deck.findFirst({
    where: {
      id: deckId,
      userId: viewerId,
      runId: activeRun.id,
    },
    include: {
      cards: {
        orderBy: [
          {
            section: "asc",
          },
          {
            card: {
              name: "asc",
            },
          },
        ],
        include: {
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

  if (!deck) {
    throw new Error("Deck wurde nicht gefunden.");
  }

  const mainLines = deck.cards
    .filter((card) => card.section === "MAIN")
    .flatMap((card) =>
      expandCardIds(
        [ensureYdkCardCode(card.card.externalCardId, card.card.name)],
        card.quantity,
      ),
    );
  const extraLines = deck.cards
    .filter((card) => card.section === "EXTRA")
    .flatMap((card) =>
      expandCardIds(
        [ensureYdkCardCode(card.card.externalCardId, card.card.name)],
        card.quantity,
      ),
    );
  const sideLines = deck.cards
    .filter((card) => card.section === "SIDE")
    .flatMap((card) =>
      expandCardIds(
        [ensureYdkCardCode(card.card.externalCardId, card.card.name)],
        card.quantity,
      ),
    );

  const exportBody = [
    "#created by Duel Hub",
    "#main",
    ...mainLines,
    "#extra",
    ...extraLines,
    "!side",
    ...sideLines,
  ].join("\n");
  const fileName = options?.fileName?.trim() || `${sanitizeFileStem(deck.name)}.ydk`;

  const exportRecord = await prisma.deckExport.create({
    data: {
      userId: viewerId,
      deckId: deck.id,
      fileName,
      exportPath: options?.exportPath?.trim() || null,
      exportBody,
    },
  });

  if (options?.linkedDuelRequestId) {
    await prisma.duelRequest.updateMany({
      where: {
        id: options.linkedDuelRequestId,
        runId: activeRun.id,
        OR: [{ requesterId: viewerId }, { opponentId: viewerId }],
      },
      data: {
        exportId: exportRecord.id,
      },
    });
  }

  if (options?.linkedTournamentMatchId) {
    await prisma.tournamentMatch.updateMany({
      where: {
        id: options.linkedTournamentMatchId,
        tournament: {
          runId: activeRun.id,
          participants: {
            some: {
              userId: viewerId,
            },
          },
        },
      },
      data: {
        deckExportId: exportRecord.id,
      },
    });
  }

  return {
    exportId: exportRecord.id,
    deckId: deck.id,
    fileName: exportRecord.fileName,
    exportPath: exportRecord.exportPath,
    exportBody,
    linkedDuelRequestId: options?.linkedDuelRequestId ?? null,
    linkedTournamentMatchId: options?.linkedTournamentMatchId ?? null,
  };
}
