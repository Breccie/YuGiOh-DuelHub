import { afterEach, describe, expect, it, vi } from "vitest";
import { wakeApiService } from "@/lib/api-wake-client";

describe("wakeApiService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("meldet einen unmittelbar verfügbaren Service als bereit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ready: true }));
    const phases: string[] = [];
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      wakeApiService({ onPhase: (phase) => phases.push(phase) }),
    ).resolves.toEqual({ ready: true, phase: "READY" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(phases).toEqual(["CHECKING", "READY"]);
  });

  it("wiederholt einen fehlgeschlagenen Kaltstart genau einmal", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ready: false }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ready: true }));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = wakeApiService();
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({ ready: true, phase: "READY" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
