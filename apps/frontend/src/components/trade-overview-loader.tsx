"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TradeConsole } from "@/components/trade-console";
import { ApiClientError, apiGetJson, isActiveRunRequiredError } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { readLocalSyncCache } from "@/lib/sync-cache";

type TradeOverviewPayload = Parameters<typeof TradeConsole>[0];

function createFallbackTradeOverview(): TradeOverviewPayload {
  return {
    viewer: {
      displayName: "Wird geladen",
      duelistId: null,
    },
    collectionValue: "0 Karten",
    latestBanlistName: "Wird geladen",
    activeEra: "Wird geladen",
    incomingTrades: [],
    outgoingTrades: [],
    historyTrades: [],
    partnerCards: [],
  };
}

export function TradeOverviewLoader() {
  const router = useRouter();
  const [payload, setPayload] = useState<TradeOverviewPayload>(
    createFallbackTradeOverview,
  );

  useEffect(() => {
    let isMounted = true;
    const cachedViewer = readLocalSyncCache().bootstrap?.viewer;

    if (cachedViewer) {
      queueMicrotask(() => {
        if (isMounted) {
          setPayload((current) => ({
            ...current,
            viewer: {
              displayName: cachedViewer.displayName,
              duelistId: cachedViewer.duelistId,
            },
          }));
        }
      });
    }

    void authClient
      .getSession()
      .then(({ session }) => {
        if (isMounted && session) {
          setPayload((current) => ({
            ...current,
            viewer: {
              displayName: session.displayName,
              duelistId: session.duelistId,
            },
          }));
        }
      })
      .catch(() => null);

    async function refresh() {
      const freshPayload = await apiGetJson<TradeOverviewPayload>(
        "/api/trades/overview",
        {
          cache: "no-store",
        },
      );

      if (isMounted) {
        setPayload((current) => ({
          ...freshPayload,
          viewer: {
            ...freshPayload.viewer,
            duelistId: freshPayload.viewer.duelistId ?? current.viewer.duelistId,
          },
        }));
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
  }, [router]);

  return <TradeConsole {...payload} />;
}
