import { NextResponse } from "next/server";
import { createDeckRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { createDeck } from "@/lib/deck-editor";
import { getDeckLegalitySnapshot } from "@/lib/deck-legality";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";

export const dynamic = "force-dynamic";

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deckId = url.searchParams.get("deckId")?.trim() || undefined;

  if (shouldProxyToApiService()) {
    const query = deckId ? `?deckId=${encodeURIComponent(deckId)}` : "";

    return proxyApiRoute(request, `/api/v1/decks/overview${query}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const snapshot = await getDeckLegalitySnapshot({
      viewerId: session.userId,
      deckId,
    });
    const viewerId = snapshot.viewer.id;
    const activeRun = await getActiveRun(prisma, viewerId);

    const [totalCards, recentCollectionEntries, deckPreviewRows] =
      await Promise.all([
        prisma.card.count(),
        prisma.collectionEntry.findMany({
          where: {
            userId: viewerId,
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
            userId: viewerId,
            runId: activeRun.id,
          },
          orderBy: [
            {
              updatedAt: "desc",
            },
            {
              createdAt: "desc",
            },
          ],
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

    return NextResponse.json({
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
          missingCardCount: summary?.missingCardCount ?? 0,
          banlistName: summary?.banlistName ?? null,
          previewImageUrl: getCardAssetUrl(
            deck.cards[0]?.card.externalCardId ?? null,
          ),
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
    });
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Deck-Übersicht konnte nicht geladen werden.",
      },
      { status },
    );
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/decks");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = createDeckRequestSchema.parse(rawBody);
    const deck = await createDeck(prisma, session.userId, body);

    return NextResponse.json(
      {
        deck: {
          id: deck.id,
          name: deck.name,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const status =
      error instanceof z.ZodError
        ? 400
        : error instanceof Error && "status" in error
          ? Number((error as { status: number }).status)
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Deck konnte nicht erstellt werden.",
      },
      { status },
    );
  }
}
