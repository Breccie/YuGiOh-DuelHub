import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiDeleteJson,
  apiGetJson,
  apiPatchJson,
  apiPost,
  apiPostJson,
  apiPutJson,
} from "@/lib/api-client";

describe("api-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it("does not advertise an empty DELETE request as JSON", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deleted: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await apiDeleteJson<{ deleted: true }>("/api/media/asset-1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/media/asset-1",
      expect.objectContaining({
        method: "DELETE",
        body: undefined,
        headers: undefined,
      }),
    );
  });

  it("weckt den Service und wiederholt ausschließlich fehlgeschlagene Lesezugriffe", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "offline" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ready: true }))
      .mockResolvedValueOnce(Response.json({ decks: ["deck-1"] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiGetJson<{ decks: string[] }>("/api/decks")).resolves.toEqual({
      decks: ["deck-1"],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/wake",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("wiederholt eine fehlgeschlagene Mutation nicht automatisch", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: "Service nicht erreichbar",
          errorDetail: { code: "service_unavailable", message: "Service nicht erreichbar" },
        },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiPostJson("/api/pack-openings", { setId: "set-1" })).rejects.toMatchObject({
      status: 503,
      code: "service_unavailable",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
