"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PackSelectionResponse } from "@ygo/contracts";
import Loading from "@/app/loading";
import { PackSelectionConsole } from "@/components/pack-selection-console";
import {
  ApiClientError,
  getApiErrorMessage,
  isActiveRunRequiredError,
} from "@/lib/api-client";
import { readLocalSyncCache } from "@/lib/sync-cache";
import { refreshLocalSyncCache } from "@/lib/sync-cache-refresh";
import { buildCachedPackSelectionPayload } from "@/lib/sync-cache-projections";
import { syncClient } from "@/lib/sync-client";

function PackSelectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#06080b] px-6 text-[#f2e6d2]">
      <section
        className="w-full max-w-xl rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[rgba(10,13,18,0.92)] p-7 shadow-[0_28px_56px_rgba(0,0,0,0.38)]"
        role="alert"
      >
        <p className="text-[0.72rem] uppercase tracking-[0.22em] text-[#cb5c44]">
          Pack-Katalog
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          Packs konnten nicht geladen werden.
        </h1>
        <p className="mt-4 text-sm leading-7 text-[#cdb79a]">{message}</p>
        <button
          type="button"
          className="mt-6 rounded-xl border border-[#cb5c44] bg-[#cb5c44] px-5 py-3 text-sm font-semibold text-[#090b0f] transition hover:bg-[#dd765f]"
          onClick={onRetry}
        >
          Erneut versuchen
        </button>
      </section>
    </main>
  );
}

export function PackSelectionLoader() {
  const router = useRouter();
  const [payload, setPayload] = useState<PackSelectionResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const cachedPayload = buildCachedPackSelectionPayload(readLocalSyncCache());
    let hasResolvedPayload = Boolean(cachedPayload);
    let freshErrorMessage: string | null = null;
    const slowLoadingTimer = window.setTimeout(() => {
      if (isMounted) {
        setLoadingSlow(true);
      }
    }, 4_000);

    if (cachedPayload) {
      queueMicrotask(() => {
        if (isMounted) {
          setPayload((currentPayload) => currentPayload ?? cachedPayload);
        }
      });
    }

    async function loadFreshPackSelection() {
      try {
        const freshPayload = await syncClient.getPackSelection();

        if (isMounted) {
          hasResolvedPayload = true;
          setPayload(freshPayload);
          setErrorMessage(null);
          setLoadingSlow(false);
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          router.replace("/login");
          return;
        }

        if (isActiveRunRequiredError(error)) {
          router.replace("/campaigns");
          return;
        }

        if (isMounted) {
          freshErrorMessage = getApiErrorMessage(
            error,
            "Der Pack-Katalog ist gerade nicht erreichbar.",
          );
        }
      }
    }

    const freshRequest = loadFreshPackSelection();
    const cacheRequest = refreshLocalSyncCache({
      shouldContinue: () => isMounted,
      onCacheUpdated: (cache) => {
        if (!isMounted) {
          return;
        }

        const nextCachedPayload = buildCachedPackSelectionPayload(cache);
        if (nextCachedPayload) {
          hasResolvedPayload = true;
          setPayload((currentPayload) => currentPayload ?? nextCachedPayload);
          setLoadingSlow(false);
        }
      },
    })
      .then((cache) => {
        if (!isMounted) {
          return;
        }

        const refreshedCachedPayload = buildCachedPackSelectionPayload(cache);
        if (refreshedCachedPayload) {
          hasResolvedPayload = true;
          setPayload((currentPayload) => currentPayload ?? refreshedCachedPayload);
        }
      })
      .catch(() => {
        // The pack endpoint above is authoritative. Cache refresh failures must not
        // block or replace the pack catalog.
      });
    void Promise.allSettled([freshRequest, cacheRequest]).then(() => {
      if (isMounted && !hasResolvedPayload && freshErrorMessage) {
        setErrorMessage(freshErrorMessage);
      }
    });

    return () => {
      isMounted = false;
      window.clearTimeout(slowLoadingTimer);
    };
  }, [retryCount, router]);

  if (!payload) {
    if (errorMessage) {
      return (
        <PackSelectionError
          message={errorMessage}
          onRetry={() => {
            setErrorMessage(null);
            setLoadingSlow(false);
            setRetryCount((currentCount) => currentCount + 1);
          }}
        />
      );
    }

    return (
      <div className="relative">
        <Loading />
        {loadingSlow ? (
          <div
            className="fixed inset-x-4 bottom-24 z-[80] mx-auto max-w-lg rounded-[10px] border border-[rgba(88,163,169,0.3)] bg-[rgba(8,20,24,0.96)] px-4 py-3 text-center text-sm text-[#d5eeee] shadow-2xl backdrop-blur-xl lg:bottom-6"
            role="status"
          >
            Der Pack-Katalog wird geladen. Ein schlafender Onlineserver kann beim
            ersten Aufruf kurz anlaufen.
          </div>
        ) : null}
      </div>
    );
  }

  return <PackSelectionConsole {...payload} />;
}
