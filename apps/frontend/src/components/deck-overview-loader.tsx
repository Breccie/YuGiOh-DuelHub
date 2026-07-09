"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DeckOverviewConsole } from "@/components/deck-overview-console";
import { ApiClientError } from "@/lib/api-client";
import { readLocalSyncCache } from "@/lib/sync-cache";
import { refreshLocalSyncCache } from "@/lib/sync-cache-refresh";
import {
  buildCachedDeckOverviewPayload,
  type CachedDeckOverviewPayload,
} from "@/lib/sync-cache-projections";
import { syncClient } from "@/lib/sync-client";

function createFallbackDeckOverview(): CachedDeckOverviewPayload {
  return {
    viewer: {
      displayName: "Duelist",
    },
    collectionProgress: {
      owned: "0",
      total: "0",
    },
    latestBanlistName: "Wird geladen",
    selectedDeckId: null,
    decks: [],
    recentCollectionCards: [],
    activeDeck: null,
    availableBanlists: [],
    collectionCards: [],
  };
}

export function DeckOverviewLoader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedDeckId = searchParams.get("deck");
  const [payload, setPayload] = useState<CachedDeckOverviewPayload>(() => {
    return (
      buildCachedDeckOverviewPayload(readLocalSyncCache(), selectedDeckId) ??
      createFallbackDeckOverview()
    );
  });

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      await refreshLocalSyncCache({
        shouldContinue: () => isMounted,
      }).catch(() => null);

      if (isMounted) {
        const cachedPayload = buildCachedDeckOverviewPayload(
          readLocalSyncCache(),
          selectedDeckId,
        );

        if (cachedPayload) {
          setPayload(cachedPayload);
        }
      }

      const queryString = selectedDeckId
        ? `?deckId=${encodeURIComponent(selectedDeckId)}`
        : "";
      const freshPayload = await syncClient.getDeckOverview(queryString);

      if (isMounted) {
        setPayload(freshPayload);
      }
    }

    void refresh().catch((error) => {
      if (error instanceof ApiClientError && error.status === 401) {
        router.replace("/login");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [router, selectedDeckId]);

  return <DeckOverviewConsole {...payload} />;
}
