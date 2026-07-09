"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DuelsConsole } from "@/components/duels-console";
import { ApiClientError, apiGetJson } from "@/lib/api-client";
import type { DuelRequestDto, ViewerSession } from "@/lib/app-dtos";

type DuelsPayload = {
  session: ViewerSession;
  duelRequests: DuelRequestDto[];
  decks: Array<{ id: string; name: string }>;
};

type DuelsApiPayload = {
  duels: DuelRequestDto[];
  decks: Array<{ id: string; name: string }>;
};

function createFallbackDuelsPayload(): DuelsPayload {
  return {
    session: {
      sessionId: "loading-session",
      userId: "loading-viewer",
      duelistId: "",
      displayName: "Duelist",
      avatarKey: "default",
      favoriteEra: null,
      isPublic: false,
      showcaseBinderId: null,
      expiresAt: new Date(0).toISOString(),
      rememberDevice: false,
      deviceLabel: null,
    },
    duelRequests: [],
    decks: [],
  };
}

export function DuelsLoader() {
  const router = useRouter();
  const [payload, setPayload] = useState<DuelsPayload>(createFallbackDuelsPayload);

  useEffect(() => {
    let isMounted = true;

    async function refresh() {
      const [sessionPayload, duelsPayload] = await Promise.all([
        apiGetJson<{ session: ViewerSession | null }>("/api/auth/session", {
          cache: "no-store",
        }),
        apiGetJson<DuelsApiPayload>("/api/duels", {
          cache: "no-store",
        }),
      ]);

      if (!sessionPayload.session) {
        throw new ApiClientError("Bitte zuerst anmelden.", { status: 401 });
      }

      if (isMounted) {
        setPayload({
          session: sessionPayload.session,
          duelRequests: duelsPayload.duels,
          decks: duelsPayload.decks,
        });
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

  return (
    <DuelsConsole
      session={payload.session}
      duelRequests={payload.duelRequests}
      decks={payload.decks}
    />
  );
}
