import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import {
  createDeckRequestSchema,
  deckExportRequestSchema,
  removeDeckCardRequestSchema,
  updateDeckRequestSchema,
  upsertDeckCardRequestSchema,
} from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCardAssetUrl } from "@/lib/asset-urls";
import {
  createDeck,
  deleteDeck,
  removeDeckCard,
  upsertDeckCard,
  updateDeckMetadata,
} from "@/lib/deck-editor";
import { createDeckExport } from "@/lib/deck-export";
import {
  getDeckLegalitySnapshot,
  type DeckLegalitySnapshot,
} from "@/lib/deck-legality";
import { getActiveRun } from "@/lib/run-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const deckOverviewQuerySchema = z.object({
  deckId: z.string().trim().min(1).optional(),
});

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

type DeckOverviewPayload = {
  viewer: {
    displayName: string;
  };
  collectionProgress: {
    owned: string;
    total: string;
  };
  latestBanlistName: string;
  selectedDeckId: string | null;
  decks: Array<{
    id: string;
    name: string;
    updatedAt: string;
    mainCount: number;
    extraCount: number;
    sideCount: number;
    isLegal: boolean;
    issueCount: number;
    banlistName: string | null;
    previewImageUrl: string | null;
    previewLabel: string;
  }>;
  recentCollectionCards: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    rarity: string | null;
    setCode: string | null;
  }>;
  activeDeck: DeckLegalitySnapshot["activeDeck"];
  availableBanlists: DeckLegalitySnapshot["editor"]["availableBanlists"];
  collectionCards: DeckLegalitySnapshot["editor"]["collectionCards"];
};

async function buildDeckOverviewPayload(
  viewerId: string,
  deckId?: string,
): Promise<DeckOverviewPayload> {
  const prisma = getPrisma();
  const sharedPrisma = getSharedPrisma();
  const snapshot = await getDeckLegalitySnapshot(
    {
      viewerId,
      deckId,
    },
    sharedPrisma,
  );
  const activeRun = await getActiveRun(sharedPrisma, snapshot.viewer.id);
  const [totalCards, recentCollectionEntries, deckPreviewRows] = await Promise.all([
    prisma.card.count(),
    prisma.collectionEntry.findMany({
      where: {
        userId: snapshot.viewer.id,
        runId: activeRun.id,
      },
      orderBy: {
        acquiredAt: "desc",
      },
      take: 8,
      include: {
        card: {
          select: {
            name: true,
            externalCardId: true,
          },
        },
        setCard: {
          select: {
            rarity: true,
            setCode: true,
          },
        },
      },
    }),
    prisma.deck.findMany({
      where: {
        userId: snapshot.viewer.id,
        runId: activeRun.id,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        cards: {
          take: 1,
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
    }),
  ]);

  const deckSummaryById = new Map(snapshot.decks.map((deck) => [deck.id, deck]));
  const latestBanlistName =
    snapshot.activeDeck?.banlistName ??
    snapshot.editor.availableBanlists[0]?.name ??
    "Keine Bannliste";

  return {
    viewer: {
      displayName: snapshot.viewer.displayName,
    },
    collectionProgress: {
      owned: formatNumber(snapshot.editor.collectionCards.length),
      total: formatNumber(totalCards),
    },
    latestBanlistName,
    selectedDeckId: snapshot.selectedDeckId,
    decks: deckPreviewRows.map((deck) => {
      const summary = deckSummaryById.get(deck.id);

      return {
        id: deck.id,
        name: deck.name,
        updatedAt: deck.updatedAt.toISOString(),
        mainCount: summary?.mainCount ?? 0,
        extraCount: summary?.extraCount ?? 0,
        sideCount: summary?.sideCount ?? 0,
        isLegal: summary?.isLegal ?? false,
        issueCount: summary?.issueCount ?? 0,
        banlistName: summary?.banlistName ?? null,
        previewImageUrl: getCardAssetUrl(deck.cards[0]?.card.externalCardId ?? null),
        previewLabel: deck.cards[0]?.card.name ?? deck.name,
      };
    }),
    recentCollectionCards: recentCollectionEntries.map((entry) => ({
      id: entry.id,
      name: entry.card.name,
      imageUrl: getCardAssetUrl(entry.card.externalCardId),
      rarity: entry.setCard?.rarity ?? null,
      setCode: entry.setCard?.setCode ?? null,
    })),
    activeDeck: snapshot.activeDeck,
    availableBanlists: snapshot.editor.availableBanlists,
    collectionCards: snapshot.editor.collectionCards,
  };
}

const deckRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const query = deckOverviewQuerySchema.parse(request.query ?? {});
      const payload = await buildDeckOverviewPayload(session.userId, query.deckId);

      return reply.send(payload);
    } catch (error) {
      return sendApiError(reply, error, "Deck-Übersicht konnte nicht geladen werden.");
    }
  });

  app.post("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createDeckRequestSchema.parse(request.body ?? {});
      const deck = await createDeck(getSharedPrisma(), session.userId, body);

      return reply.status(201).send({
        deck: {
          id: deck.id,
          name: deck.name,
        },
      });
    } catch (error) {
      return sendApiError(reply, error, "Deck konnte nicht erstellt werden.");
    }
  });

  app.patch("/:deckId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { deckId } = request.params as { deckId: string };
      const body = updateDeckRequestSchema.parse(request.body ?? {});
      const deck = await updateDeckMetadata(
        getSharedPrisma(),
        session.userId,
        deckId,
        body,
      );

      return reply.send({
        deck: {
          id: deck.id,
          name: deck.name,
        },
      });
    } catch (error) {
      return sendApiError(reply, error, "Deck konnte nicht aktualisiert werden.");
    }
  });

  app.delete("/:deckId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { deckId } = request.params as { deckId: string };
      await deleteDeck(getSharedPrisma(), session.userId, deckId);

      return reply.send({ ok: true });
    } catch (error) {
      return sendApiError(reply, error, "Deck konnte nicht gelöscht werden.");
    }
  });

  app.post("/:deckId/cards", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { deckId } = request.params as { deckId: string };
      const body = upsertDeckCardRequestSchema.parse(request.body ?? {});
      const deckCard = await upsertDeckCard(
        getSharedPrisma(),
        session.userId,
        deckId,
        body,
      );

      return reply.send({
        deckCard: {
          id: deckCard.id,
        },
      });
    } catch (error) {
      return sendApiError(reply, error, "Deckkarte konnte nicht gespeichert werden.");
    }
  });

  app.delete("/:deckId/cards", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { deckId } = request.params as { deckId: string };
      const body = removeDeckCardRequestSchema.parse(request.body ?? {});
      await removeDeckCard(getSharedPrisma(), session.userId, deckId, body);

      return reply.send({ ok: true });
    } catch (error) {
      return sendApiError(reply, error, "Deckkarte konnte nicht entfernt werden.");
    }
  });

  app.post("/:deckId/export", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { deckId } = request.params as { deckId: string };
      const body = deckExportRequestSchema.parse(request.body ?? {});
      const result = await createDeckExport(
        getSharedPrisma(),
        session.userId,
        deckId,
        body,
      );

      return reply.send({
        export: result,
      });
    } catch (error) {
      return sendApiError(reply, error, "Deck konnte nicht exportiert werden.");
    }
  });
};

export default deckRoutes;
