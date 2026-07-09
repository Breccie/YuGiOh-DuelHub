"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { HomeDashboardResponse } from "@ygo/contracts";
import { HomeConsole } from "@/components/home-console";
import { ApiClientError, isActiveRunRequiredError } from "@/lib/api-client";
import {
  readCachedDashboardSummary,
  writeCachedDashboardSummary,
} from "@/lib/dashboard-cache";
import { syncClient } from "@/lib/sync-client";

function createFallbackDashboard(): HomeDashboardResponse {
  return {
    viewer: {
      displayName: "Duelist",
    },
    collectionValue: "Wird geladen",
    activeRunName: "Kampagne",
    latestBanlistName: "Wird geladen",
    activeEra: "Sync",
    topbar: {
      friendCount: 0,
      friendOnlineCount: 0,
      duelRequestCount: 0,
    },
    heroStats: [
      {
        label: "Credits",
        value: "...",
      },
      {
        label: "Offen",
        value: "...",
      },
      {
        label: "Gratispacks",
        value: "...",
      },
      {
        label: "Promos",
        value: "...",
      },
    ],
    newsItems: [
      {
        id: "loading",
        kicker: "Sync",
        title: "Kampagne wird aktualisiert",
        detail: "Lokale Daten werden angezeigt, sobald der Online-Stand geladen ist.",
        meta: "Online",
      },
    ],
    duelRequests: [],
    tradeRequests: [],
    progressCards: [
      {
        id: "packs",
        label: "Packs öffnen",
        value: "...",
        detail: "Packstatus wird synchronisiert.",
        action: "Zu Packs",
      },
      {
        id: "promos",
        label: "Promos abholen",
        value: "...",
        detail: "Promostatus wird synchronisiert.",
        action: "Promos",
      },
      {
        id: "tournaments",
        label: "Turnier prüfen",
        value: "...",
        detail: "Match-Aktionen werden synchronisiert.",
        action: "Turniere",
      },
      {
        id: "collection",
        label: "Sammlung",
        value: "...",
        detail: "Sammlung wird synchronisiert.",
        action: "Sammlung",
      },
    ],
  };
}

export function HomeConsoleLoader() {
  const router = useRouter();
  const [{ hadCachedDashboard, payload }, setDashboardState] = useState(() => {
    const cached = readCachedDashboardSummary();

    return {
      hadCachedDashboard: Boolean(cached),
      payload: cached?.payload ?? createFallbackDashboard(),
    };
  });

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      const freshPayload = await syncClient.getDashboardSummary();

      if (!isMounted) {
        return;
      }

      setDashboardState({
        hadCachedDashboard: true,
        payload: freshPayload,
      });
      writeCachedDashboardSummary(freshPayload);
      void syncClient.bootstrap().catch(() => null);
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

      if (!hadCachedDashboard && isMounted) {
        setDashboardState({
          hadCachedDashboard: false,
          payload: createFallbackDashboard(),
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [hadCachedDashboard, router]);

  return <HomeConsole {...payload} />;
}
