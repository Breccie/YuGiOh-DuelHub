"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TradeConsole } from "@/components/trade-console";
import { ApiClientError, apiGetJson, isActiveRunRequiredError } from "@/lib/api-client";

type TradeOverviewPayload = Parameters<typeof TradeConsole>[0];

function createFallbackTradeOverview(): TradeOverviewPayload {
  return {
    viewer: {
      displayName: "Duelist",
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

    async function refresh() {
      const freshPayload = await apiGetJson<TradeOverviewPayload>(
        "/api/trades/overview",
        {
          cache: "no-store",
        },
      );

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
      }
    });

    return () => {
      isMounted = false;
    };
  }, [router]);

  return <TradeConsole {...payload} />;
}
