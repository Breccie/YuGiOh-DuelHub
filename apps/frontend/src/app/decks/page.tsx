import { redirect } from "next/navigation";
import { DeckOverviewConsole } from "@/components/deck-overview-console";
import { getCardAssetUrl } from "@/lib/asset-urls";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getDeckLegalitySnapshot } from "@/lib/deck-legality";
import { getPrisma } from "@/lib/prisma";

type RemoteDeckOverviewPayload = Parameters<typeof DeckOverviewConsole>[0];

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

export default async function DecksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const params = (await searchParams) ?? {};
  const deckId = readSearchParam(params.deck);

  if (shouldProxyToApiService()) {
    const query = deckId ? `?deckId=${encodeURIComponent(deckId)}` : "";
    const pageData = await fetchApiServiceJson<RemoteDeckOverviewPayload>(
      `/api/v1/decks/overview${query}`,
    );

    return <DeckOverviewConsole {...pageData} />;
  }

  const snapshot = await getDeckLegalitySnapshot({
    viewerId: session.userId,
    deckId,
  });

  const viewerId = snapshot.viewer.id;

  const [totalCards, recentCollectionEntries, deckPreviewRows] = await Promise.all([
    prisma.card.count(),
    prisma.collectionEntry.findMany({
      where: {
        userId: viewerId,
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

  return (
    <DeckOverviewConsole
      viewer={{
        displayName: snapshot.viewer.displayName,
      }}
      collectionProgress={{
        owned: formatNumber(snapshot.editor.collectionCards.length),
        total: formatNumber(totalCards),
      }}
      latestBanlistName={latestBanlistName}
      selectedDeckId={snapshot.selectedDeckId}
      decks={deckPreviewRows.map((deck) => {
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
      })}
      recentCollectionCards={recentCollectionEntries.map((entry) => ({
        id: entry.id,
        name: entry.card.name,
        imageUrl: getCardAssetUrl(entry.card.externalCardId),
        rarity: entry.setCard?.rarity ?? null,
        setCode: entry.setCard?.setCode ?? null,
      }))}
      activeDeck={snapshot.activeDeck}
      availableBanlists={snapshot.editor.availableBanlists}
      collectionCards={snapshot.editor.collectionCards}
    />
  );
}
