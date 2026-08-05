"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ApiWakePhase,
  wakeApiService,
} from "@/lib/api-wake-client";

export function useApiWake(options?: { autoStart?: boolean }) {
  const [phase, setPhase] = useState<ApiWakePhase>("CHECKING");
  const activeRequest = useRef<Promise<boolean> | null>(null);

  const wake = useCallback(async () => {
    if (activeRequest.current) {
      return activeRequest.current;
    }

    const request = wakeApiService({ onPhase: setPhase })
      .then((result) => result.ready)
      .finally(() => {
        activeRequest.current = null;
      });
    activeRequest.current = request;
    return request;
  }, []);

  useEffect(() => {
    if (options?.autoStart === false) {
      return;
    }

    void wake();
  }, [options?.autoStart, wake]);

  return { phase, ready: phase === "READY", wake };
}
