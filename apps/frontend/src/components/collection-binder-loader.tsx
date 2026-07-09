"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CollectionBinderConsole } from "@/components/collection-binder-console";
import { ApiClientError, isActiveRunRequiredError } from "@/lib/api-client";
import { collectionClient } from "@/lib/collection-client";
import type { CollectionBinderEditorSnapshot } from "@/lib/collection-showcase";
import { readLocalSyncCache } from "@/lib/sync-cache";
import { refreshLocalSyncCache } from "@/lib/sync-cache-refresh";
import {
  buildCachedCollectionPagePayload,
  type CachedCollectionPagePayload,
} from "@/lib/sync-cache-projections";
import { syncClient } from "@/lib/sync-client";

function createFallbackCollection(): CachedCollectionPagePayload {
  return {
    viewer: {
      id: "cached-viewer",
      displayName: "Duelist",
    },
    binders: [],
    presets: [],
    totals: {
      totalCopies: 0,
      uniqueCards: 0,
      cardsWithDuplicates: 0,
      availableCopies: 0,
      reservedCopies: 0,
      tradedCopies: 0,
    },
    cards: [],
    recentEntries: [],
    totalCards: 0,
  };
}

export function CollectionBinderLoader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<CachedCollectionPagePayload>(() => {
    return (
      buildCachedCollectionPagePayload(readLocalSyncCache()) ??
      createFallbackCollection()
    );
  });
  const [editorSnapshot, setEditorSnapshot] =
    useState<CollectionBinderEditorSnapshot | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      await refreshLocalSyncCache({
        shouldContinue: () => isMounted,
      }).catch(() => null);

      if (isMounted) {
        const cachedPayload = buildCachedCollectionPagePayload(readLocalSyncCache());

        if (cachedPayload) {
          setPayload(cachedPayload);
        }
      }

      const queryString = searchParams.toString();
      const freshPayload = await syncClient.getCollection(
        queryString ? `?${queryString}` : "",
      );

      if (isMounted) {
        setPayload(freshPayload);
      }

      const editorMode = searchParams.get("mode");
      const editorBinderId = searchParams.get("binder");

      if (editorMode === "edit" && editorBinderId) {
        const snapshot = await collectionClient.getBinderEditor(editorBinderId);

        if (isMounted) {
          setEditorSnapshot(snapshot);
        }
      } else if (isMounted) {
        setEditorSnapshot(null);
      }
    }

    void refresh().catch((error) => {
      if (error instanceof ApiClientError && error.status === 401) {
        router.replace("/login");
        return;
      }

      if (isActiveRunRequiredError(error)) {
        router.replace("/campaigns");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [router, searchParams]);

  return (
    <CollectionBinderConsole
      viewer={{
        displayName: payload.viewer.displayName,
      }}
      collectionProgress={{
        owned: payload.totals.uniqueCards,
        total: payload.totalCards,
        copies: payload.totals.totalCopies,
        duplicates: payload.totals.cardsWithDuplicates,
        available: payload.totals.availableCopies,
      }}
      binders={payload.binders}
      presets={payload.presets}
      cards={payload.cards}
      recentEntries={payload.recentEntries}
      initialEditorSnapshot={editorSnapshot}
    />
  );
}
