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
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const cachedPayload = buildCachedPackSelectionPayload(readLocalSyncCache());

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
          setPayload(freshPayload);
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
          setErrorMessage(
            getApiErrorMessage(error, "Der Pack-Katalog ist gerade nicht erreichbar."),
          );
        }
      }
    }

    void loadFreshPackSelection();
    void refreshLocalSyncCache({
      shouldContinue: () => isMounted,
    })
      .then((cache) => {
        if (!isMounted) {
          return;
        }

        const refreshedCachedPayload = buildCachedPackSelectionPayload(cache);
        if (refreshedCachedPayload) {
          setPayload((currentPayload) => currentPayload ?? refreshedCachedPayload);
        }
      })
      .catch(() => {
        // The pack endpoint above is authoritative. Cache refresh failures must not
        // block or replace the pack catalog.
      });

    return () => {
      isMounted = false;
    };
  }, [retryCount, router]);

  if (!payload) {
    if (errorMessage) {
      return (
        <PackSelectionError
          message={errorMessage}
          onRetry={() => {
            setErrorMessage(null);
            setRetryCount((currentCount) => currentCount + 1);
          }}
        />
      );
    }

    return <Loading />;
  }

  return <PackSelectionConsole {...payload} />;
}
