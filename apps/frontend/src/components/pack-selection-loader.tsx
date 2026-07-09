"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PackSelectionResponse } from "@ygo/contracts";
import { PackSelectionConsole } from "@/components/pack-selection-console";
import { ApiClientError } from "@/lib/api-client";
import { readLocalSyncCache } from "@/lib/sync-cache";
import { refreshLocalSyncCache } from "@/lib/sync-cache-refresh";
import { buildCachedPackSelectionPayload } from "@/lib/sync-cache-projections";
import { syncClient } from "@/lib/sync-client";

function createFallbackPackSelection(): PackSelectionResponse {
  return {
    viewer: {
      displayName: "Duelist",
    },
    wallet: null,
    activeRunId: null,
    collectionProgress: {
      owned: 0,
      total: 0,
    },
    latestBanlistName: "Wird geladen",
    selectedSetId: null,
    sets: [],
    recentCollectionCards: [],
    activeDeck: null,
  };
}

export function PackSelectionLoader() {
  const router = useRouter();
  const [payload, setPayload] = useState<PackSelectionResponse>(() => {
    return (
      buildCachedPackSelectionPayload(readLocalSyncCache()) ??
      createFallbackPackSelection()
    );
  });

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      await refreshLocalSyncCache({
        shouldContinue: () => isMounted,
      }).catch(() => null);

      if (isMounted) {
        const cachedPayload = buildCachedPackSelectionPayload(readLocalSyncCache());

        if (cachedPayload) {
          setPayload(cachedPayload);
        }
      }

      const freshPayload = await syncClient.getPackSelection();

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
  }, [router]);

  return <PackSelectionConsole {...payload} />;
}
