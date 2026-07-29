"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DeckEditorWorkspace } from "@/components/deck-editor-workspace";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { ApiClientError, getApiErrorMessage, isActiveRunRequiredError } from "@/lib/api-client";
import type { CachedDeckOverviewPayload } from "@/lib/sync-cache-projections";
import { syncClient } from "@/lib/sync-client";

export function DeckEditorRouteLoader({
  deckId,
}: {
  deckId: string | null;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<CachedDeckOverviewPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const query = deckId ? `?deckId=${encodeURIComponent(deckId)}` : "";

    void syncClient.getDeckOverview(query).then((freshPayload) => {
      if (isMounted) {
        setPayload(
          deckId
            ? freshPayload
            : {
                ...freshPayload,
                activeDeck: null,
                selectedDeckId: null,
                collectionCards: freshPayload.collectionCards.map((card) => ({
                  ...card,
                  deckCopies: 0,
                  mainCopies: 0,
                  extraCopies: 0,
                  sideCopies: 0,
                })),
              },
        );
        setLoadError("");
      }
    }).catch((error) => {
      if (error instanceof ApiClientError && error.status === 401) {
        router.replace("/login");
        return;
      }

      if (isActiveRunRequiredError(error)) {
        router.replace("/campaigns");
        return;
      }

      if (isMounted) {
        setLoadError(getApiErrorMessage(error, "Deckeditor konnte nicht geladen werden."));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [deckId, retryRevision, router]);

  if (!payload) {
    return (
      <DuelConsoleScaffold
        activePath="/decks"
        viewer={{ displayName: "Duelist" }}
        metrics={[]}
      >
        <div className="grid h-[calc(100dvh-164px)] min-h-[560px] place-items-center rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[#05080d] px-5 text-[#e9dccb] lg:h-[calc(100dvh-100px)] lg:min-h-[620px]">
          <div className="w-full max-w-sm rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[#0b1119] p-5 text-center">
            <p className="text-sm">{loadError || "Deckeditor wird geladen…"}</p>
            {loadError ? (
              <button
                type="button"
                className="ui-button-secondary mt-4"
                onClick={() => setRetryRevision((revision) => revision + 1)}
              >
                Erneut versuchen
              </button>
            ) : null}
          </div>
        </div>
      </DuelConsoleScaffold>
    );
  }

  return (
    <DeckEditorWorkspace
      viewer={payload.viewer}
      activeDeck={payload.activeDeck}
      availableBanlists={payload.availableBanlists}
      collectionCards={payload.collectionCards}
    />
  );
}
