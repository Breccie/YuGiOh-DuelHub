"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const deckDetailCache = new Map<
  string,
  NonNullable<CachedDeckOverviewPayload["activeDeck"]>
>();

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
  const [detailsLoading, setDetailsLoading] = useState(false);
  const detailRequestRef = useRef(0);
  const initialSelectedDeckIdRef = useRef(selectedDeckId);

  const loadDeckDetail = useCallback(async (deckId: string, foreground = true) => {
    const cached = deckDetailCache.get(deckId);
    if (cached) {
      setPayload((current) => ({
        ...current,
        selectedDeckId: deckId,
        activeDeck: cached,
      }));
      return cached;
    }

    const requestId = foreground ? detailRequestRef.current + 1 : detailRequestRef.current;
    if (foreground) detailRequestRef.current = requestId;
    if (foreground) setDetailsLoading(true);

    try {
      const detail = await syncClient.getDeckDetail(deckId);
      if (detail.activeDeck) deckDetailCache.set(deckId, detail.activeDeck);
      if (foreground && detailRequestRef.current === requestId) {
        setPayload((current) => ({
          ...current,
          selectedDeckId: deckId,
          activeDeck: detail.activeDeck,
        }));
      }
      return detail.activeDeck;
    } finally {
      if (foreground && detailRequestRef.current === requestId) {
        setDetailsLoading(false);
      }
    }
  }, []);

  const selectDeck = useCallback((deckId: string) => {
    detailRequestRef.current += 1;
    const cached = deckDetailCache.get(deckId) ?? null;
    setPayload((current) => ({
      ...current,
      selectedDeckId: deckId,
      activeDeck: cached,
    }));
    router.replace(`/decks?deck=${encodeURIComponent(deckId)}`, { scroll: false });
    void loadDeckDetail(deckId).catch((error) => {
      setLoadError(getApiErrorMessage(error, "Deckdetails konnten nicht geladen werden."));
    });
  }, [loadDeckDetail, router]);

  const prefetchDeck = useCallback((deckId: string) => {
    if (deckDetailCache.has(deckId)) return;
    void loadDeckDetail(deckId, false).catch(() => null);
  }, [loadDeckDetail]);

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      setLoadError("");
      void refreshLocalSyncCache({
        shouldContinue: () => isMounted,
      }).catch(() => null);

      const library = await syncClient.getDeckLibrary();

      if (isMounted) {
        const requestedDeckId = initialSelectedDeckIdRef.current;
        const preferredDeckId = requestedDeckId && library.decks.some((deck) => deck.id === requestedDeckId)
          ? requestedDeckId
          : library.selectedDeckId ?? library.decks[0]?.id ?? null;
        const cachedDetail = preferredDeckId ? deckDetailCache.get(preferredDeckId) ?? null : null;
        setPayload((current) => ({
          ...current,
          ...library,
          selectedDeckId: preferredDeckId,
          activeDeck: cachedDetail,
        }));
        if (preferredDeckId) {
          void loadDeckDetail(preferredDeckId).catch((error) => {
            if (isMounted) {
              setLoadError(getApiErrorMessage(error, "Deckdetails konnten nicht geladen werden."));
            }
          });
        }
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
  }, [loadDeckDetail, retryRevision, router]);

  useEffect(() => {
    if (!selectedDeckId || selectedDeckId === payload.selectedDeckId) return;
    const exists = payload.decks.some((deck) => deck.id === selectedDeckId);
    if (!exists) return;
    const cached = deckDetailCache.get(selectedDeckId) ?? null;
    const frameId = window.requestAnimationFrame(() => {
      setPayload((current) => ({ ...current, selectedDeckId, activeDeck: cached }));
      void loadDeckDetail(selectedDeckId).catch((error) => {
        setLoadError(getApiErrorMessage(error, "Deckdetails konnten nicht geladen werden."));
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [loadDeckDetail, payload.decks, payload.selectedDeckId, selectedDeckId]);

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
      <DeckOverviewConsole
        {...payload}
        detailsLoading={detailsLoading}
        onSelectDeck={selectDeck}
        onPrefetchDeck={prefetchDeck}
      />
    </>
  );
}
