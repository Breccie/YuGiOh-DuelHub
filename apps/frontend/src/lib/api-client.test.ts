import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiPatchJson,
  apiPost,
  apiPostJson,
  apiPutJson,
} from "@/lib/api-client";

describe("api-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed json payloads for successful requests", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deck: { id: "deck-1", name: "Dark Magician" } }), {
        status: 201,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const payload = await apiPostJson<
      { deck: { id: string; name: string } },
      { name: string }
    >("/api/decks", {
      name: "Dark Magician",
    });

    expect(payload.deck.id).toBe("deck-1");
    expect(payload.deck.name).toBe("Dark Magician");
  });

  it("throws a typed ApiClientError for failed requests", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Trade konnte nicht aktualisiert werden.",
          errorDetail: {
            code: "trade_state_invalid",
            message: "Trade konnte nicht aktualisiert werden.",
          },
        }),
        {
          status: 409,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    await expect(
      apiPatchJson<{ trade: { id: string } }, { action: string }>(
        "/api/trades/trade-1/decision",
        { action: "accept" },
      ),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      message: "Trade konnte nicht aktualisiert werden.",
      status: 409,
      code: "trade_state_invalid",
    });
  });

  it("supports no-body posts and json put requests", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ page: { id: "page-1" } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      );

    const logoutPayload = await apiPost<{ ok: boolean }>("/api/auth/logout");
    const pagePayload = await apiPutJson<{ page: { id: string } }, { slots: unknown[] }>(
      "/api/collection/binders/binder-1/pages/page-1",
      { slots: [] },
    );

    expect(logoutPayload.ok).toBe(true);
    expect(pagePayload.page.id).toBe("page-1");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "/api/auth/logout",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/collection/binders/binder-1/pages/page-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ slots: [] }),
      }),
    );
  });
});
