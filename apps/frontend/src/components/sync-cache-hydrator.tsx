"use client";

import { useEffect } from "react";
import { refreshLocalSyncCache } from "@/lib/sync-cache-refresh";

export function SyncCacheHydrator() {
  useEffect(() => {
    let isMounted = true;

    void refreshLocalSyncCache({
      shouldContinue: () => isMounted,
    }).catch(() => null);

    return () => {
      isMounted = false;
    };
  }, []);

  return null;
}
