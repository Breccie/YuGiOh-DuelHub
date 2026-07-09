"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreditLedgerEntryDto } from "@ygo/contracts";
import { TournamentsConsole } from "@/components/tournaments-console";
import { ApiClientError, apiGetJson, isActiveRunRequiredError } from "@/lib/api-client";
import type { TournamentOverviewDto, ViewerSession } from "@/lib/app-dtos";
import { authClient } from "@/lib/auth-client";
import { readLocalSyncCache } from "@/lib/sync-cache";

type TournamentsOverviewPayload = {
  session: ViewerSession;
  tournaments: TournamentOverviewDto[];
  currency: {
    balance: number;
    tournamentCreditsEarned: number;
    packCreditsSpent: number;
    recentEntries: CreditLedgerEntryDto[];
  };
};

function createFallbackTournamentsOverview(): TournamentsOverviewPayload {
  return {
    session: {
      sessionId: "cached-session",
      userId: "cached-viewer",
      duelistId: "",
      displayName: "Wird geladen",
      avatarKey: "default",
      favoriteEra: null,
      isPublic: false,
      showcaseBinderId: null,
      expiresAt: new Date(0).toISOString(),
      rememberDevice: false,
      deviceLabel: null,
    },
    tournaments: [],
    currency: {
      balance: 0,
      tournamentCreditsEarned: 0,
      packCreditsSpent: 0,
      recentEntries: [],
    },
  };
}

export function TournamentsLoader() {
  const router = useRouter();
  const [payload, setPayload] = useState<TournamentsOverviewPayload>(
    createFallbackTournamentsOverview,
  );

  useEffect(() => {
    let isMounted = true;
    const cachedViewer = readLocalSyncCache().bootstrap?.viewer;

    if (cachedViewer) {
      queueMicrotask(() => {
        if (isMounted) {
          setPayload((current) => ({
            ...current,
            session: {
              ...current.session,
              userId: cachedViewer.userId,
              duelistId: cachedViewer.duelistId,
              displayName: cachedViewer.displayName,
            },
          }));
        }
      });
    }

    void authClient
      .getSession()
      .then(({ session }) => {
        if (isMounted && session) {
          setPayload((current) => ({ ...current, session }));
        }
      })
      .catch(() => null);

    async function refresh() {
      const freshPayload = await apiGetJson<TournamentsOverviewPayload>(
        "/api/tournaments/overview",
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

  return (
    <TournamentsConsole
      session={payload.session}
      tournaments={payload.tournaments}
      currency={payload.currency}
    />
  );
}
