export type ApiWakePhase = "CHECKING" | "WAKING" | "READY" | "UNAVAILABLE";

export type ApiWakeResult = {
  ready: boolean;
  phase: ApiWakePhase;
};

const TOTAL_WAKE_WINDOW_MS = 75_000;
const RETRY_DELAY_MS = 3_000;

function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export async function wakeApiService(options?: {
  onPhase?: (phase: ApiWakePhase) => void;
  signal?: AbortSignal;
}): Promise<ApiWakeResult> {
  const startedAt = Date.now();
  const onPhase = options?.onPhase;
  let attempt = 0;

  onPhase?.("CHECKING");

  while (Date.now() - startedAt < TOTAL_WAKE_WINDOW_MS && attempt < 2) {
    attempt += 1;
    const slowIndicator = setTimeout(() => onPhase?.("WAKING"), 650);

    try {
      const remainingMs = Math.max(1_000, TOTAL_WAKE_WINDOW_MS - (Date.now() - startedAt));
      const timeoutSignal = AbortSignal.timeout(remainingMs);
      const signal = options?.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
      const response = await fetch("/api/system/wake", {
        cache: "no-store",
        signal,
      });

      if (response.ok) {
        onPhase?.("READY");
        return { ready: true, phase: "READY" };
      }
    } catch (error) {
      if (options?.signal?.aborted) {
        throw error;
      }
    } finally {
      clearTimeout(slowIndicator);
    }

    if (attempt < 2 && Date.now() - startedAt + RETRY_DELAY_MS < TOTAL_WAKE_WINDOW_MS) {
      onPhase?.("WAKING");
      await delay(RETRY_DELAY_MS);
    }
  }

  onPhase?.("UNAVAILABLE");
  return { ready: false, phase: "UNAVAILABLE" };
}
