"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { refreshLocalSyncCache } from "@/lib/sync-cache-refresh";

export function SyncCacheHydrator() {
  useEffect(() => {
    let isMounted = true;

    void authClient
      .getSession()
      .then(({ session }) => {
        if (!session || !isMounted) {
          return;
        }

        return refreshLocalSyncCache({
          shouldContinue: () => isMounted,
        });
      })
      .catch(() => null);

    return () => {
      isMounted = false;
    };
  }, []);

  return null;
}
