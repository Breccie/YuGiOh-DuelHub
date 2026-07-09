"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TradeCreateConsole } from "@/components/trade-create-console";
import { ApiClientError, apiGetJson } from "@/lib/api-client";

type TradeCreatePayload = Parameters<typeof TradeCreateConsole>[0];

function createFallbackTradeCreate(): TradeCreatePayload {
  return {
    viewer: {
      displayName: "Duelist",
      duelistId: "",
    },
    collectionValue: "0 Karten",
    latestBanlistName: "Wird geladen",
    activeEra: "Wird geladen",
    availableCards: [],
    partners: [],
  };
}

export function TradeCreateLoader() {
  const router = useRouter();
  const [payload, setPayload] = useState<TradeCreatePayload>(
    createFallbackTradeCreate,
  );

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      const freshPayload = await apiGetJson<TradeCreatePayload>(
        "/api/trades/create-view",
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
      }
    });

    return () => {
      isMounted = false;
    };
  }, [router]);

  return <TradeCreateConsole {...payload} />;
}
