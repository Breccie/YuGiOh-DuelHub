"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DeckOverviewConsole } from "@/components/deck-overview-console";
import { ApiClientError, getApiErrorMessage, isActiveRunRequiredError } from "@/lib/api-client";
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
  const [loadError, setLoadError] = useState("");
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      setLoadError("");
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
        return;
      }

      if (isActiveRunRequiredError(error)) {
        router.replace("/campaigns");
        return;
      }

      if (isMounted) {
        setLoadError(getApiErrorMessage(error, "Deckdaten konnten nicht aktualisiert werden."));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [retryRevision, router, selectedDeckId]);

  return (
    <>
      {loadError ? (
        <div role="alert" className="fixed left-1/2 top-4 z-[70] flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-[16px] border border-[rgba(204,97,78,0.34)] bg-[#21100f] px-4 py-3 text-sm text-[#ffe3ca] shadow-2xl">
          <span>{loadError} Eventuell werden lokale Zwischendaten angezeigt.</span>
          <button type="button" className="ui-button-neutral" onClick={() => setRetryRevision((revision) => revision + 1)}>
            Erneut versuchen
          </button>
        </div>
      ) : null}
      <DeckOverviewConsole {...payload} />
    </>
  );
}
